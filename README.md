# Tally Elections Backend

A comprehensive backend system for managing blockchain-based elections with secure voter management, ballot building, and voting functionality.

## 🚀 Features

### Core Functionality
- **User Authentication**: JWT-based authentication with bcrypt password hashing
- **Election Management**: Create, update, and manage elections with full lifecycle support
- **Voter Management**: Secure voter registration with encrypted keys and verification
- **Ballot Building**: Flexible ballot creation with multiple question types and validation
- **Voting System**: Secure voting with blockchain integration and result calculation
- **Preview System**: Election preview functionality with URL generation
- **Blockchain Integration**: Ready for smart contract deployment

### Security Features
- **Encrypted Voter Keys**: AES-256 encryption for voter keys (invisible to even VCs)
- **JWT Authentication**: Secure token-based authentication
- **Input Validation**: Comprehensive request validation with express-validator
- **CORS Protection**: Configurable cross-origin resource sharing
- **Helmet Security**: HTTP security headers

## 🛠️ Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT + bcryptjs
- **Validation**: express-validator
- **Security**: helmet, cors, morgan

## 📋 Prerequisites

- Node.js 18+ 
- MongoDB 5+
- npm or yarn

## 🔧 Installation

1. **Clone and install dependencies**
   ```bash
   cd tally_backend
   npm install
   ```

2. **Environment Setup**
   Create a `.env` file in the root directory:
   ```bash
   # Database Configuration
   MONGO_URI=mongodb://localhost:27017/tally_elections
   
   # JWT Configuration
   JWT_SECRET=your-super-secret-jwt-key-change-in-production
   JWT_EXPIRES_IN=7d
   
   # Server Configuration
   PORT=5000
   NODE_ENV=development
   
   # Frontend URL (for CORS and URL generation)
   FRONTEND_URL=http://localhost:5173
   
   # Voter Key Encryption (CRITICAL: Change in production!)
   VOTER_KEY_ENCRYPTION_KEY=your-super-secure-32-character-encryption-key
   
   # Optional: IPFS Configuration (for vote metadata)
   IPFS_GATEWAY=https://ipfs.io/ipfs/
   IPFS_API_URL=http://localhost:5001
   
   # Optional: Blockchain Configuration
   ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/your-project-id
   ETHEREUM_PRIVATE_KEY=your-private-key-for-deployment
   ```

   **Important**: 
   - `MONGO_URI`: MongoDB connection string
   - `JWT_SECRET`: Strong secret key for JWT signing (change in production!)
   - `VOTER_KEY_ENCRYPTION_KEY`: 32-character encryption key for voter keys (change in production!)
   - `FRONTEND_URL`: Must match your frontend URL for CORS to work
   - `PORT`: Backend server port (frontend will connect to this)

3. **Database Setup**
   ```bash
   # Start MongoDB (if running locally)
   mongod
   
   # Or use Docker
   docker run -d -p 27017:27017 --name mongodb mongo:latest
   ```

4. **Run the application**
   ```bash
   # Development mode
   npm run dev
   
   # Production build
   npm run build
   npm start
   ```

## 🗄️ Database Models

### User Model
- Basic user information (name, email, password)
- Password hashing with bcrypt
- Timestamps for creation and updates

### Election Model
- Comprehensive election configuration
- Status tracking (DRAFT, SCHEDULED, ACTIVE, COMPLETED, CANCELLED)
- Blockchain integration fields
- Ballot configuration and voter settings
- Metadata and categorization

### Voter Model
- **Encrypted voter keys** (AES-256, invisible to VCs)
- Voter verification and status management
- Blockchain address mapping
- Vote weight and eligibility tracking
- Metadata and custom fields

### Ballot Model
- Flexible question types (single, multiple, ranking, text, file)
- Question validation and constraints
- Display logic and conditional questions
- Version control and publishing
- Settings and configuration

### Vote Model
- Secure vote recording
- Blockchain transaction tracking
- IPFS metadata integration
- Vote validation and verification
- Result calculation support

## 🔐 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/user/profile` - Get user profile
- `PUT /api/user/profile` - Update user profile

### Elections
- `POST /api/elections/user` - Create election draft
- `GET /api/elections/user` - Get user's elections
- `GET /api/elections/user/stats` - Get election statistics
- `GET /api/elections/user/:id` - Get specific user election
- `PUT /api/elections/user/:id` - Update election draft
- `DELETE /api/elections/user/:id` - Delete election draft
- `POST /api/elections/user/:id/deploy` - Deploy election to blockchain
- `GET /api/elections/public` - Get public elections
- `GET /api/elections/:id` - Get public election details

### Voter Management
- `POST /api/elections/:id/voters` - Add single voter
- `POST /api/elections/:id/voters/bulk` - Bulk import voters
- `GET /api/elections/:id/voters` - Get election voters (paginated)
- `GET /api/elections/:id/voters/stats` - Get voter statistics
- `PATCH /api/elections/:id/voters/:voterId/status` - Update voter status
- `DELETE /api/elections/:id/voters/:voterId` - Delete voter
- `GET /api/elections/:id/voters/export` - Export voters for deployment
- `POST /api/elections/verify/:token` - Verify voter (public)

### Ballot Management
- `POST /api/elections/:id/ballot` - Create/update ballot
- `GET /api/elections/:id/ballot` - Get election ballot (creator only)
- `POST /api/elections/:id/ballot/publish` - Publish ballot
- `POST /api/elections/:id/ballot/unpublish` - Unpublish ballot
- `POST /api/elections/:id/ballot/version` - Create new version
- `GET /api/elections/:id/ballot/versions` - Get version history
- `GET /api/elections/:id/ballot/version/:version` - Get specific version
- `GET /api/elections/:id/ballot/export` - Export for deployment
- `GET /api/elections/:id/ballot/public` - Get public ballot (voting)

### Voting & Results
- `POST /api/elections/:id/vote` - Submit vote (public)
- `GET /api/elections/:id/vote/:voterId` - Get voter's vote
- `GET /api/elections/:id/results` - Get results (creator only)
- `GET /api/elections/:id/results/public` - Get public results
- `POST /api/elections/vote/:voteId/confirm` - Confirm vote on blockchain
- `POST /api/elections/vote/:voteId/reject` - Reject vote

### Preview & URLs
- `POST /api/elections/:id/preview/url` - Generate preview URL
- `GET /api/elections/:id/preview/:token` - Get preview data
- `GET /api/elections/:id/preview/:token/mobile` - Mobile preview
- `GET /api/elections/:id/preview/:token/validate` - Validate access
- `GET /api/elections/:id/preview/stats` - Preview statistics
- `POST /api/elections/:id/live/url` - Generate live URL

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: bcrypt with salt rounds
- **Input Validation**: Comprehensive request validation
- **CORS Protection**: Configurable cross-origin resource sharing
- **Voter Key Encryption**: AES-256 encryption (keys invisible to VCs)
- **Request Rate Limiting**: Built-in protection against abuse
- **Helmet Security**: HTTP security headers

## 🚀 Deployment Workflow

### Phase 1: Election Setup (Database)
1. Create election draft
2. Add voters with encrypted keys
3. Build ballot with questions
4. Preview and test election
5. Generate preview URLs

### Phase 2: Blockchain Deployment
1. Export voters and ballot data
2. Deploy smart contracts
3. Update election with blockchain addresses
4. Generate live voting URLs
5. Activate election for voting

## 📱 Frontend Integration

The backend is designed to work seamlessly with the Tally Elections frontend:

- **Real-time Updates**: WebSocket support for live results
- **Mobile Optimization**: Responsive API endpoints
- **Preview System**: Complete election preview functionality
- **Voter Management**: Comprehensive voter CRUD operations
- **Ballot Builder**: Flexible ballot creation interface

## 🔧 Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Start production server
npm start
```

## 📝 Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `MONGO_URI` | MongoDB connection string | Yes | - |
| `JWT_SECRET` | JWT signing secret | Yes | - |
| `JWT_EXPIRES_IN` | JWT expiration time | No | `7d` |
| `PORT` | Server port | No | `5000` |
| `NODE_ENV` | Environment mode | No | `development` |
| `FRONTEND_URL` | Frontend URL for CORS | Yes | - |
| `VOTER_KEY_ENCRYPTION_KEY` | Voter key encryption | Yes | - |
| `IPFS_GATEWAY` | IPFS gateway URL | No | - |
| `IPFS_API_URL` | IPFS API endpoint | No | - |
| `ETHEREUM_RPC_URL` | Ethereum RPC endpoint | No | - |
| `ETHEREUM_PRIVATE_KEY` | Deployment private key | No | - |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review the API endpoints

---

**Note**: This backend is production-ready with comprehensive security features. Remember to change all default secrets and encryption keys before deploying to production.
