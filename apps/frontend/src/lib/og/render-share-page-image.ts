export async function renderSharePageImage(title: string) {
  const response = await fetch(`https://api.orshot.com/v1/studio/render`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.ORSHOT_API_KEY}`,
    },
    body: JSON.stringify({
      templateId: 10,
      modifications: {
        title,
      },
      response: {
        type: 'binary',
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Orshot API error: ${response.status}`);
  }

  const blob = await response.blob();
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
