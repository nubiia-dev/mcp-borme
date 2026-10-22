# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly:

1. **Do not** open a public issue
2. Email the maintainer directly or use GitHub's private vulnerability reporting
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will respond within 48 hours and work with you to understand and address the issue.

## Security Best Practices

When using this MCP server:

- The OpenMercantil API key is optional; if you use one, keep it secure and never commit it
  to version control
- Use environment variables for sensitive configuration
- Prefer a dedicated key for this MCP server so it can be rotated independently; a leaked
  key lets others consume your plan's quota
- `OPENMERCANTIL_BASE_URL` only accepts https (or http to localhost), so the key cannot be
  sent in clear text to a remote host
- Regularly update to the latest version for security patches
- Review the permissions granted to the MCP server in your AI assistant
- The server only reads data (all tools are `readOnlyHint`) and never writes to disk
