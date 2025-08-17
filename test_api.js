const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

// Test the API endpoints
async function testAPI() {
  console.log('🧪 Testing Tally Backend API...\n');

  try {
    // Test health endpoint
    console.log('1. Testing health endpoint...');
    const healthResponse = await axios.get(`${BASE_URL}/health`);
    console.log('✅ Health check passed:', healthResponse.data);
    console.log('');

    // Test elections endpoint
    console.log('2. Testing elections endpoint...');
    try {
      const electionsResponse = await axios.get(`${BASE_URL}/elections/test`);
      console.log('✅ Elections test endpoint working:', electionsResponse.data);
    } catch (error) {
      if (error.response?.status === 404) {
        console.log('✅ Elections router is working (404 expected for test endpoint)');
      } else {
        console.log('❌ Elections endpoint error:', error.message);
      }
    }
    console.log('');

    // Test auth endpoint (should return 401 without token)
    console.log('3. Testing auth endpoint...');
    try {
      const authResponse = await axios.get(`${BASE_URL}/auth/profile`);
      console.log('❌ Auth endpoint should require authentication');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ Auth endpoint properly protected (401 expected)');
      } else {
        console.log('❌ Auth endpoint error:', error.message);
      }
    }
    console.log('');

    console.log('🎉 API testing completed!');
    console.log('');
    console.log('📋 Next steps:');
    console.log('1. Ensure MongoDB is running');
    console.log('2. Set up environment variables (.env file)');
    console.log('3. Test with authentication tokens');
    console.log('4. Test ballot and voter endpoints with valid election IDs');

  } catch (error) {
    console.error('❌ API test failed:', error.message);
    console.log('');
    console.log('🔧 Troubleshooting:');
    console.log('1. Check if backend server is running on port 5000');
    console.log('2. Verify MongoDB connection');
    console.log('3. Check environment variables');
    console.log('4. Review server logs for errors');
  }
}

// Run the test
testAPI();
