// scripts/build-icons.mjs
// ---------------------------------------------------------------------------
// ProjectFlowDesigner — icon pack builder.
//
// USAGE:
//   npm run build:icons
//
// WHERE TO DROP THE PACKS:
//   Unzip the official icon packs into:
//     icon-packs/raw/aws/    (AWS Architecture Icons — keeps its Arch_<Category> folders)
//     icon-packs/raw/gcp/    (Google Cloud icons)
//     icon-packs/raw/azure/  (Azure icons)
//   Any other subdirectory of icon-packs/raw/<provider>/ is also picked up
//   and treated as its own provider.
//
// WHAT IT DOES:
//   - Recursively finds every *.svg inside each provider dir.
//   - Optimizes each SVG with SVGO (multipass).
//   - Writes the optimized SVG to public/icons/<provider>/<slug>.svg
//     (public/ so Vite serves it at /icons/<provider>/<slug>.svg).
//   - Emits src/icons/generated/<provider>.json: an array of IconEntry
//     { id, name, provider, category, source:'svg', ref, keywords }.
//
// The script is idempotent (re-running overwrites cleanly) and skips any
// provider dir that is missing or contains no SVGs.
// ---------------------------------------------------------------------------

import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { optimize } from 'svgo';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'icon-packs', 'raw');
const PUBLIC_ICONS_DIR = path.join(ROOT, 'public', 'icons');
const GENERATED_DIR = path.join(ROOT, 'src', 'icons', 'generated');

const svgoConfig = {
  multipass: true,
  plugins: [
    {
      name: 'preset-default',
      params: { overrides: { removeViewBox: false } },
    },
  ],
};

/** Recursively collect all *.svg files under dir. */
async function walkSvgs(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await walkSvgs(full)));
    } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.svg')) {
      out.push(full);
    }
  }
  return out;
}

/** List immediate subdirectories of a dir (the provider dirs). */
async function listProviderDirs(dir) {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

const TITLE_LOWER = new Set([
  'and', 'or', 'the', 'of', 'for', 'to', 'a', 'an', 'on', 'in', 'with',
]);

/** Turn a token list into Title Case, preserving product-name casing. */
function titleCase(tokens) {
  return tokens
    .map((t, i) => {
      // Preserve tokens that carry intentional casing: an internal capital
      // (DynamoDB, CloudFront, SageMaker, ElastiCache, IoT) or an all-caps
      // acronym (AWS, EC2, S3, IAM, VPC).
      if (/[A-Z]/.test(t.slice(1)) || t === t.toUpperCase()) {
        return t;
      }
      const lower = t.toLowerCase();
      if (i > 0 && TITLE_LOWER.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/** Derive a human-friendly name from a raw filename (no extension). */
function deriveName(rawBase) {
  let s = rawBase;
  // Strip common provider/category prefixes.
  s = s.replace(/^(Arch|Res|Arch-Category|Category)[_-]/i, '');
  // Strip leading provider tokens.
  s = s.replace(/^(Amazon|AWS|Azure|GCP|Google[_-]?Cloud|Google)[_-]/i, '');
  // Strip size suffixes: _48 _16 _64, @5x, -2x, _light/_dark variants.
  s = s.replace(/[_-]\d{1,4}(?=($|[_-]))/g, '');
  s = s.replace(/@\d+x/gi, '');
  s = s.replace(/[_-]\d+x(?=($|[_-]))/gi, '');
  // Normalize separators.
  const tokens = s
    .replace(/[_-]+/g, ' ')
    // NOTE: do not split camelCase — AWS product names are deliberately
    // camelCase (DynamoDB, EventBridge, SageMaker, CloudFront, ElastiCache).
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return rawBase;
  return titleCase(tokens);
}

/** Slug for filename + id (lowercase, dash-separated, ascii). */
function slugify(name) {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/** Derive a category from the path (AWS groups by Arch_<Category> folders). */
function deriveCategory(relPath) {
  const parts = relPath.split(path.sep).slice(0, -1); // drop filename
  for (const part of parts.reverse()) {
    const m = part.match(/^(?:Arch[_-]|Category[_-])(.+)$/i);
    if (m) {
      return titleCase(m[1].replace(/[_-]+/g, ' ').split(/\s+/).filter(Boolean));
    }
  }
  // Fall back to the first meaningful folder under the provider dir.
  if (parts.length) {
    const cand = parts[parts.length - 1];
    if (cand && !/^\d+$/.test(cand)) {
      return titleCase(
        cand.replace(/^(Arch|Res)[_-]/i, '').replace(/[_-]+/g, ' ').split(/\s+/).filter(Boolean),
      );
    }
  }
  return 'General';
}

/**
 * Search aliases keyed by slug — AWS names many services in full
 * ("Elastic Container Service"), but people search by acronym ("ECS"). These
 * extra keywords make every common acronym / nickname find the right icon.
 */
const ALIASES = {
  // Storage
  'simple-storage-service': ['s3'],
  'simple-storage-service-glacier': ['glacier', 's3-glacier'],
  's3-on-outposts': ['s3'],
  'elastic-block-store': ['ebs'],
  efs: ['elastic-file-system'],
  // Compute
  ec2: ['elastic-compute-cloud', 'instance', 'vm', 'virtual-machine', 'server'],
  'elastic-beanstalk': ['beanstalk'],
  lambda: ['serverless', 'function'],
  // Containers
  'elastic-container-service': ['ecs'],
  'ecs-anywhere': ['ecs'],
  'elastic-container-registry': ['ecr'],
  'elastic-kubernetes-service': ['eks', 'k8s', 'kubernetes'],
  'eks-anywhere': ['eks', 'k8s'],
  'eks-distro': ['eks', 'k8s'],
  fargate: ['serverless', 'containers'],
  // Databases
  rds: ['relational-database-service', 'database'],
  dynamodb: ['nosql', 'ddb'],
  elasticache: ['redis', 'memcached', 'cache'],
  documentdb: ['mongodb', 'mongo'],
  memorydb: ['redis'],
  'database-migration-service': ['dms'],
  // Security / Identity
  'identity-and-access-management': ['iam'],
  'iam-identity-center': ['sso', 'identity-center', 'single-sign-on'],
  'key-management-service': ['kms'],
  'certificate-manager': ['acm', 'ssl', 'tls'],
  'private-certificate-authority': ['acm-pca', 'pca'],
  'secrets-manager': ['secrets'],
  waf: ['firewall', 'web-application-firewall'],
  cognito: ['auth', 'authentication', 'users', 'login'],
  // Networking
  'virtual-private-cloud': ['vpc'],
  'elastic-load-balancing': ['elb', 'alb', 'nlb', 'load-balancer'],
  'route-53': ['route53', 'dns'],
  cloudfront: ['cdn'],
  'client-vpn': ['vpn'],
  'site-to-site-vpn': ['vpn'],
  'transit-gateway': ['tgw'],
  'direct-connect': ['dx'],
  // App integration
  'simple-notification-service': ['sns'],
  'simple-queue-service': ['sqs'],
  'simple-email-service': ['ses', 'email'],
  eventbridge: ['events', 'cloudwatch-events'],
  'step-functions': ['sfn', 'workflow', 'state-machine'],
  'managed-streaming-for-apache-kafka': ['msk', 'kafka'],
  'managed-service-for-apache-flink': ['flink', 'kinesis-analytics'],
  // Analytics
  'opensearch-service': ['opensearch', 'elasticsearch', 'es'],
  emr: ['hadoop', 'spark'],
  glue: ['etl'],
  athena: ['query', 'sql'],
  redshift: ['data-warehouse', 'warehouse'],
  // AI / ML
  sagemaker: ['ml', 'machine-learning'],
  bedrock: ['genai', 'llm', 'generative-ai'],
  // Management
  cloudwatch: ['monitoring', 'logs', 'metrics', 'observability'],
  cloudformation: ['iac', 'cfn', 'infrastructure-as-code'],
  cloudtrail: ['audit'],
  'systems-manager': ['ssm'],
  // Front-end
  appsync: ['graphql'],
  // Migration
  'application-migration-service': ['mgn'],
};

/** Build keyword list from name + category tokens (deduped, lowercased). */
function buildKeywords(name, category, provider, slug) {
  const tokens = `${name} ${category} ${provider}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
  if (slug && ALIASES[slug]) tokens.push(...ALIASES[slug]);
  return [...new Set(tokens)];
}

async function buildProvider(provider) {
  const srcDir = path.join(RAW_DIR, provider);
  const svgs = await walkSvgs(srcDir);
  if (svgs.length === 0) {
    return { provider, count: 0, skipped: true };
  }

  const outIconsDir = path.join(PUBLIC_ICONS_DIR, provider);
  await mkdir(outIconsDir, { recursive: true });

  const entries = [];
  const usedSlugs = new Set();

  for (const file of svgs) {
    const rel = path.relative(srcDir, file);
    const rawBase = path.basename(file, path.extname(file));
    const name = deriveName(rawBase);
    const category = deriveCategory(rel);

    let slug = slugify(name) || slugify(rawBase) || 'icon';
    // Ensure unique slug within provider.
    if (usedSlugs.has(slug)) {
      let i = 2;
      while (usedSlugs.has(`${slug}-${i}`)) i++;
      slug = `${slug}-${i}`;
    }
    usedSlugs.add(slug);

    const raw = await readFile(file, 'utf8');
    let optimized = raw;
    try {
      const res = optimize(raw, { ...svgoConfig, path: file });
      optimized = res.data;
    } catch (err) {
      console.warn(`  ! SVGO failed for ${rel}: ${err.message} (using raw)`);
    }

    await writeFile(path.join(outIconsDir, `${slug}.svg`), optimized, 'utf8');

    entries.push({
      id: `${provider}:${slug}`,
      name,
      provider,
      category,
      source: 'svg',
      ref: `/icons/${provider}/${slug}.svg`,
      keywords: buildKeywords(name, category, provider, slug),
    });
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));

  await mkdir(GENERATED_DIR, { recursive: true });
  const outJson = path.join(GENERATED_DIR, `${provider}.json`);
  await writeFile(outJson, JSON.stringify(entries, null, 2) + '\n', 'utf8');

  return { provider, count: entries.length, skipped: false, outJson };
}

async function main() {
  console.log('ProjectFlowDesigner — building icon catalog...\n');

  if (!existsSync(RAW_DIR)) {
    console.log(`No raw icon dir found at ${path.relative(ROOT, RAW_DIR)} — nothing to do.`);
    console.log('Drop packs into icon-packs/raw/<provider>/ then re-run.');
    return { files: [], notes: ['icon-packs/raw missing; skipped'] };
  }

  const providers = await listProviderDirs(RAW_DIR);
  if (providers.length === 0) {
    console.log('No provider subdirectories under icon-packs/raw — nothing to do.');
    return { files: [], notes: ['no provider dirs under icon-packs/raw'] };
  }

  const files = [];
  const notes = [];
  let total = 0;

  for (const provider of providers.sort()) {
    const res = await buildProvider(provider);
    if (res.skipped) {
      console.log(`  ${provider}: empty (no .svg files) — skipped.`);
      notes.push(`${provider}: empty, skipped`);
      continue;
    }
    total += res.count;
    files.push(path.relative(ROOT, res.outJson));
    console.log(`  ${provider}: ${res.count} icons`);
  }

  console.log(`\nTotal: ${total} icons across ${files.length} provider file(s).`);
  if (total === 0) {
    notes.push('no SVGs found in any provider dir');
  }

  return { files, notes };
}

main()
  .then((result) => {
    // Machine-readable result line for tooling.
    console.log('\nRESULT ' + JSON.stringify(result));
  })
  .catch((err) => {
    console.error('build-icons failed:', err);
    process.exit(1);
  });
