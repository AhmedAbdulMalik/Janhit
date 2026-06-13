async function main() {
  const url = process.env.URL || 'http://localhost:8787/api/process';

  const payload = {
    transcript: 'Highlight the submit button',
    context: {
      url: 'https://example.com/form',
      title: 'Example Form',
      page: {
        title: 'Example Form',
        visibleText: 'Please fill out the form',
        elements: [
          { id: 'name', label: 'Name', selector: '#name', role: 'field', type: 'text', text: '' },
          { id: 'email', label: 'Email', selector: '#email', role: 'field', type: 'email', text: '' },
          { id: 'submit', label: 'Submit', selector: '#submit', role: 'button', text: 'Submit', clickable: true },
        ],
      },
    },
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await resp.json();
  console.log('Status:', resp.status);
  console.log(JSON.stringify(json, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
