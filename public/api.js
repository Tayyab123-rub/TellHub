const API_URL = "https://tellhub.loca.lt";

async function apiGetContacts(email) {
    const res = await fetch(`${API_URL}/api/contacts?email=${email}`);
    return await res.json();
}

async function apiAddContact(myEmail, contactEmail, contactName) {
    const res = await fetch(`${API_URL}/api/add-contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ myEmail, contactEmail, contactName })
    });
    return await res.json();
}

async function apiDeleteContact(myEmail, contactEmail) {
    const res = await fetch(`${API_URL}/api/delete-contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ myEmail, contactEmail })
    });
    return await res.json();
}