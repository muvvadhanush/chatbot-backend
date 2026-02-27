function buildPrompt({ systemPrompt, context, userMessage, connection }) {

  let styleInstruction = '';

  if (connection.tone === 'friendly')
    styleInstruction = "Respond in a friendly tone.";
  if (connection.tone === 'formal')
    styleInstruction = "Respond in a professional formal tone.";

  if (connection.responseLength === 'short')
    styleInstruction += " Keep the response concise.";
  if (connection.responseLength === 'detailed')
    styleInstruction += " Provide a detailed explanation.";

  return `
${systemPrompt}

${styleInstruction}

Context:
${context}

User Question:
${userMessage}
`;
}
