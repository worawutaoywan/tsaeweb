import { createPrivateKey, sign } from 'node:crypto';

const required = [
  'GITHUB_APP_ID',
  'GITHUB_APP_PRIVATE_KEY',
  'GITHUB_APP_WEBHOOK_SECRET',
];

for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
}

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
  iat: now - 60,
  exp: now + 540,
  iss: process.env.GITHUB_APP_ID,
})}`;
const privateKey = createPrivateKey(process.env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n'));
const signature = sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url');
const token = `${unsigned}.${signature}`;

const response = await fetch('https://api.github.com/app/hook/config', {
  method: 'PATCH',
  headers: {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'TSAE-Pages-CMS-setup',
    'X-GitHub-Api-Version': '2022-11-28',
  },
  body: JSON.stringify({
    url: 'https://cms.tsae.asia/api/webhook/github',
    content_type: 'json',
    insecure_ssl: '0',
    secret: process.env.GITHUB_APP_WEBHOOK_SECRET,
  }),
});

if (!response.ok) {
  throw new Error(`GitHub webhook update failed: ${response.status} ${await response.text()}`);
}

const result = await response.json();
if (result.url !== 'https://cms.tsae.asia/api/webhook/github') {
  throw new Error('GitHub returned an unexpected webhook URL');
}

console.log('GitHub App webhook configured successfully');
