# Security Policy

## Supported versions

Nodra is maintained by a single developer on a best-effort basis. Only the
**latest released version** (the most recent tag / GitHub Release) and the
current `main` branch receive security fixes. Older versions are not patched —
please upgrade to the latest release before reporting an issue.

| Version            | Supported          |
| ------------------ | ------------------ |
| Latest release     | :white_check_mark: |
| Older releases     | :x:                |

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report privately through GitHub's built-in private vulnerability reporting:

1. Go to the **Security** tab of this repository.
2. Click **Report a vulnerability** (GitHub Security Advisories).

This opens a private channel visible only to the maintainer.

If you cannot use GitHub, email **quentincattoen@hotmail.fr** with the details.

Please include:

- A description of the vulnerability and its impact.
- Steps to reproduce (proof of concept if possible).
- Affected version / commit and platform (web, or Tauri desktop on
  macOS/Windows/Linux).
- Whether it involves a downloadable plugin or the core app.

## What to expect

This is a solo, non-commercial project, so timelines are best-effort:

- **Acknowledgement:** within about **7 days**.
- **Triage / initial assessment:** within about **14 days**.
- **Fix:** depends on severity and complexity; coordinated with you before
  any public disclosure.

Please allow a reasonable period for a fix before any public disclosure.

## Scope

In scope: the Nodra core application (this repository) and the official
first-party plugins maintained under the `arediss` account.

Out of scope: third-party / community plugins (report those to their authors),
and issues that require a malicious plugin the user chose to install — plugins
are third-party code you trust at install time.

## No bounty

There is no paid bug-bounty program. Credit will gladly be given in the
release notes / advisory for responsibly disclosed issues, if you wish.
