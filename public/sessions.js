function loadSessions() {
    fetch('/sessions')
        .then(response => response.json())
        .then(sessions => {
            const tbody = document.getElementById('sessionsBody');
            tbody.innerHTML = '';
            sessions.forEach(session => {
                const row = `
                    <tr>
                        <td>${session.sessionId}</td>
                        <td>${session.status}</td>
                        <td>${session.apiKey}</td>
                        <td>${session.webhook}</td>
                        <td>
                            <button class="button" onclick="deleteSession('${session.sessionId}')">Delete</button>
                            <button class="button" onclick="reconnectSession('${session.sessionId}')">Reconnect</button>
                            <button class="button" onclick="updateWebhook('${session.sessionId}')">Update Webhook</button>
                            <button class="button" onclick="getQR('${session.sessionId}')">Get QR</button>
                        </td>
                    </tr>
                `;
                tbody.innerHTML += row;
            });
        })
        .catch(error => {
            console.error('Error loading sessions:', error);
            alert('Failed to load sessions. Please refresh the page.');
        });
}

function createNewSession() {
    const sessionId = prompt("Enter new session ID:");
    if (sessionId) {
        fetch(`/genapi/${sessionId}`, { method: 'POST' })
            .then(response => response.json())
            .then(data => {
                alert(`New session created with API key: ${data.apiKey}`);
                loadSessions();
                getQR(sessionId);
            })
            .catch(error => {
                console.error('Error creating new session:', error);
                alert('Failed to create new session. Please try again.');
            });
    }
}

function deleteSession(sessionId) {
    if (confirm(`Are you sure you want to delete session ${sessionId}?`)) {
        fetch(`/delapi/${sessionId}`, { method: 'DELETE' })
            .then(() => {
                alert(`Session ${sessionId} deleted`);
                loadSessions();
            })
            .catch(error => {
                console.error('Error deleting session:', error);
                alert('Failed to delete session. Please try again.');
            });
    }
}

function reconnectSession(sessionId) {
    fetch(`/start/${sessionId}`)
        .then(response => response.text())
        .then(result => {
            alert(result);
            loadSessions();
        })
        .catch(error => {
            console.error('Error reconnecting session:', error);
            alert('Failed to reconnect session. Please try again.');
        });
}

function updateWebhook(sessionId) {
    const newWebhook = prompt("Enter new webhook URL:");
    if (newWebhook) {
        fetch(`/set-webhook/${sessionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ webhookUrl: newWebhook })
        })
        .then(response => response.text())
        .then(result => {
            alert(result);
            loadSessions();
        })
        .catch(error => {
            console.error('Error updating webhook:', error);
            alert('Failed to update webhook. Please try again.');
        });
    }
}

function getQR(sessionId) {
    fetch(`/qr/${sessionId}`)
        .then(response => {
            if (response.status === 202) {
                alert('QR code not yet generated. Please wait a moment and try again.');
                return;
            }
            return response.json();
        })
        .then(data => {
            if (data && data.qrCode) {
                const qrWindow = window.open("", "QR Code", "width=300,height=300");
                qrWindow.document.write(`<img src="${data.qrCode}" alt="QR Code">`);
            }
        })
        .catch(error => {
            console.error('Error fetching QR code:', error);
            alert('Failed to fetch QR code. Please try again.');
        });
}

// Load sessions when the page loads
document.addEventListener('DOMContentLoaded', loadSessions);

// Refresh sessions every 10 seconds
setInterval(loadSessions, 10000);