async function sendLeadToCRM(data) {
  await axios.post(process.env.CRM_ENDPOINT, data);
}
