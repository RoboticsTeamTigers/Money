const path = require('path');
const fs = require('fs').promises;

// List of protected pages that require authentication
const protectedPages = [
  '/dashboard.html',
  '/profile.html',
  '/settings.html',
  // Add any other protected pages here
];

// Simple authentication middleware
const authMiddleware = async (req, res, next) => {
  // Skip authentication for API routes and non-protected pages
  if (req.path.startsWith('/api/') || !isProtectedPath(req.path)) {
    return next();
  }

  // Check for auth token in cookies
  const authToken = req.headers.cookie?.split(';')
    .find(c => c.trim().startsWith('auth='))
    ?.split('=')[1];

  if (!authToken) {
    // No auth token found, redirect to login
    return res.redirect('/login.html');
  }

  try {
    // Validate the token (this is a simple implementation)
    // In a production app, you would use JWT or other secure token validation
    const [email, hash] = authToken.split(':');
    
    if (!email || !hash) {
      return res.redirect('/login.html');
    }

    // Load users to validate
    const usersFilePath = path.join(__dirname, '..', 'users.json');
    const users = JSON.parse(await fs.readFile(usersFilePath, 'utf8'));
    
    // Find the user with matching email and password hash
    const user = users.find(u => u.email === email && u.password === hash);
    
    if (!user) {
      // Invalid token, redirect to login
      return res.redirect('/login.html');
    }
    
    // User is authenticated, proceed
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.redirect('/login.html');
  }
};

// Helper function to check if path is protected
function isProtectedPath(path) {
  // Handle root path to dashboard redirects
  if (path === '/' || path === '/index.html') {
    return false;
  }
  
  return protectedPages.some(protectedPath => {
    return path === protectedPath || path.startsWith(`${protectedPath}/`);
  });
}

module.exports = authMiddleware;
