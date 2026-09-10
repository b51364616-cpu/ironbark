// netlify/functions/publish.js
//
// This function is the one thing standing between "customer clicks a
// button" and "content.json gets updated on GitHub." It holds the
// credentials so the customer's browser never has to.
//
// Set these once per client site, in the Netlify dashboard under
// Site settings -> Environment variables. The customer never sees
// or enters any of this — only you do, once, when you hand the site over.
//
//   GITHUB_TOKEN    a fine-grained personal access token, scoped to
//                   ONLY this client's repo, with Contents: read & write
//   GITHUB_REPO     e.g. "b51364616-cpu/ironbark"
//   GITHUB_BRANCH   e.g. "main"
//   ADMIN_PASSCODE  the same passcode the customer types into admin.html —
//                   this stops a stranger who finds the function's web
//                   address from publishing junk to the site

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const { GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH, ADMIN_PASSCODE } = process.env;

  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'This site isn\u2019t connected yet. GITHUB_TOKEN and GITHUB_REPO need to be set in Netlify\u2019s environment variables first.'
      })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Bad request' }) };
  }

  if (ADMIN_PASSCODE && payload.passcode !== ADMIN_PASSCODE) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Wrong passcode' }) };
  }
  if (!payload.content) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No content received' }) };
  }

  const branch = GITHUB_BRANCH || 'main';
  const api = `https://api.github.com/repos/${GITHUB_REPO}/contents/content.json`;
  const headers = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'workshop-editor'
  };

  try {
    // Need the current file's sha to update it rather than create a duplicate.
    const existingRes = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers });
    let sha;
    if (existingRes.ok) {
      sha = (await existingRes.json()).sha;
    } else if (existingRes.status !== 404) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Could not read the current file from GitHub (' + existingRes.status + ')' }) };
    }

    const contentStr = JSON.stringify(payload.content, null, 2);
    const base64 = Buffer.from(contentStr, 'utf-8').toString('base64');

    const putRes = await fetch(api, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: 'Update site content from the workshop editor',
        content: base64,
        branch,
        sha
      })
    });

    if (!putRes.ok) {
      const t = await putRes.text();
      return { statusCode: 502, body: JSON.stringify({ error: 'GitHub rejected the update: ' + t.slice(0, 300) }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};
