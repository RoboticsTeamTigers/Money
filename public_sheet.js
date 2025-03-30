const SHARED_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1D7ovONGIaclZMs-6i5FrMCJFHzP0DMF01f7uXsjk-2s/edit?usp=sharingL'; // Replace with your shared Google Sheet URL

async function saveUser(userData) {
    try {
        const storedUsers = JSON.parse(localStorage.getItem('users') || '[]');
        storedUsers.push({
            name: userData.name,
            email: userData.email,
            password: userData.password,
            dateRegistered: new Date().toISOString()
        });
        localStorage.setItem('users', JSON.stringify(storedUsers));
        return true;
    } catch (error) {
        console.error('Error saving user:', error);
        return false;
    }
}

async function getUser(email) {
    try {
        const storedUsers = JSON.parse(localStorage.getItem('users') || '[]');
        return storedUsers.find(user => user.email === email) || null;
    } catch (error) {
        console.error('Error getting user:', error);
        return null;
    }
}
