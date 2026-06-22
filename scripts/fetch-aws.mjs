import { writeFileSync } from 'node:fs';
const ACR = new Set(['aws','api','ec2','s3','sqs','sns','rds','iam','vpc','ecs','eks','kms','ssm','elb','efs','ebs','cdn','dns','ai','ml','iot','vpn','waf','acm','sso','mq','emr','rds','glue','ecr','ec','db']);
function titleize(slug){
  return slug.split('-').map(w=> ACR.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
}
const res = await fetch('https://api.iconify.design/collection?prefix=logos');
const data = await res.json();
// gather all icon names (uncategorized + categories)
let names = [...(data.uncategorized||[])];
if (data.categories) for (const arr of Object.values(data.categories)) names.push(...arr);
names = [...new Set(names)];
const aws = names.filter(n => n.startsWith('aws-')).sort();
const entries = aws.map(n => {
  const label = titleize(n.replace(/^aws-/,''));
  const kw = n.replace(/^aws-/,'').split('-');
  return `  { id: 'bi:${n}', name: ${JSON.stringify(label)}, provider: 'aws', category: 'AWS', source: 'iconify', ref: 'logos:${n}', keywords: ${JSON.stringify(['aws',...kw])} },`;
});
const file = `import type { IconEntry } from './catalog';\n\n// Auto-generated from the Iconify \`logos\` collection (all aws-* icons).\n// Regenerate with: node scripts/fetch-aws.mjs\nexport const awsLogos: IconEntry[] = [\n${entries.join('\n')}\n];\n`;
writeFileSync('src/icons/aws-logos.ts', file);
console.log('AWS icons found in logos:', aws.length);
console.log('wrote src/icons/aws-logos.ts');
