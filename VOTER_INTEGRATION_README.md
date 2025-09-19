# Voter Management System - Frontend-Backend Integration

## 🎯 Overview

The voter management system is now fully connected between the frontend and backend, providing a seamless experience for managing voters in elections.

## ✨ Features Implemented

### Backend Features
- ✅ **Voter CRUD Operations**: Add, update, delete, and list voters
- ✅ **Bulk Import**: CSV import with validation and error handling
- ✅ **Email Notifications**: Automatic verification emails and status updates
- ✅ **Real-time Notifications**: In-app notifications for all operations
- ✅ **Security**: JWT authentication, encrypted voter keys, role-based access
- ✅ **Status Management**: PENDING → VERIFIED → ACTIVE → SUSPENDED workflow

### Frontend Features
- ✅ **Voter Management UI**: Clean, responsive interface
- ✅ **Real-time Updates**: Automatic refresh after operations
- ✅ **CSV Import**: Drag & drop file upload with preview
- ✅ **Status Management**: Dropdown actions for voter status changes
- ✅ **Search & Filter**: Real-time voter search functionality
- ✅ **Statistics Dashboard**: Voter counts by status

## 🚀 Getting Started

### 1. Backend Setup
```bash
cd tally_backend
npm install
npm run dev
```

### 2. Frontend Setup
```bash
cd tally-client
npm install
npm run dev
```

### 3. Environment Variables
Create `.env` files in both directories:

**Backend (.env):**
```env
MONGO_URI=mongodb://localhost:27017/tally_elections
JWT_SECRET=your-super-secret-jwt-key
VOTER_KEY_ENCRYPTION_KEY=your-32-char-encryption-key
FRONTEND_URL=http://localhost:5173
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

**Frontend (.env):**
```env
VITE_API_URL=http://localhost:5000/api
```

## 🔧 API Endpoints

### Voter Management
```
POST   /api/elections/:electionId/voters          # Add single voter
POST   /api/elections/:electionId/voters/bulk     # Bulk import voters
GET    /api/elections/:electionId/voters          # List voters (paginated)
PATCH  /api/elections/:electionId/voters/:id/status # Update voter status
DELETE /api/elections/:electionId/voters/:id      # Delete voter
GET    /api/elections/:electionId/voters/stats    # Voter statistics
GET    /api/elections/:electionId/voters/export   # Export for blockchain
```

### Public Endpoints
```
POST   /api/verify/:token                         # Email verification
```

## 📧 Email System

### Automatic Emails Sent
1. **Voter Registration**: Verification email with 24-hour expiry
2. **Status Updates**: Notifications when voter status changes
3. **Bulk Import**: Confirmation emails for successful imports

### Email Templates
- Professional HTML design with responsive layout
- Clear call-to-action buttons
- Status-specific styling and messaging
- Fallback text versions for email clients

## 🔐 Security Features

### Authentication
- JWT tokens with 7-day expiry
- Secure password hashing with bcrypt
- Role-based access control

### Voter Security
- AES-256 encrypted voter keys
- SHA-256 hashed keys for blockchain
- 24-hour verification token expiry
- Secure key generation

## 📱 Frontend Components

### VoterManagement.tsx
- Main voter management interface
- Add individual voters
- Bulk CSV import
- Real-time statistics display

### VoterList.tsx
- Searchable voter list
- Status management dropdown
- Delete confirmation
- Real-time updates

## 🗄️ Database Schema

### Voter Model
```typescript
interface Voter {
  _id: string;
  electionId: ObjectId;
  name: string;
  email: string;
  uniqueId: string;
  status: 'PENDING' | 'VERIFIED' | 'ACTIVE' | 'SUSPENDED';
  voterKey: string; // Encrypted
  voterKeyHash: string; // For blockchain
  voteWeight: number;
  hasVoted: boolean;
  verificationToken?: string;
  verificationExpires?: Date;
  metadata?: VoterMetadata;
}
```

## 🔄 Data Flow

### Adding a Voter
1. Frontend sends voter data to backend
2. Backend generates secure voter key and verification token
3. Voter is saved to database with encrypted key
4. Verification email is sent automatically
5. Notification is sent to election administrator
6. Frontend receives success response and refreshes list

### Bulk Import
1. Frontend parses CSV file and validates data
2. Backend processes voter array in batches
3. Each voter gets individual verification email
4. Success/failure counts are returned
7. Frontend displays results and refreshes list

### Status Updates
1. Administrator changes voter status via dropdown
2. Backend updates database and sends email notification
3. In-app notification is sent
4. Frontend refreshes to show updated status

## 🧪 Testing

### Backend Testing
```bash
cd tally_backend
node test-voter-api.js
```

### Frontend Testing
1. Start both servers
2. Navigate to voter management
3. Test add voter functionality
4. Test CSV import
5. Test status updates
6. Test search and filter

## 🐛 Troubleshooting

### Common Issues

**Backend won't start:**
- Check MongoDB connection
- Verify environment variables
- Check port availability

**Emails not sending:**
- Verify SMTP credentials
- Check network connectivity
- Use Ethereal Email for development

**Frontend can't connect:**
- Verify API URL in .env
- Check CORS configuration
- Ensure backend is running

**Voter operations failing:**
- Check JWT token validity
- Verify election ownership
- Check database connectivity

### Debug Mode
Enable debug logging in backend:
```env
NODE_ENV=development
DEBUG=voter:*
```

## 🚀 Production Deployment

### Security Checklist
- [ ] Change default JWT secret
- [ ] Change default encryption key
- [ ] Configure production SMTP
- [ ] Enable HTTPS
- [ ] Set up proper CORS origins
- [ ] Configure rate limiting

### Performance Optimization
- [ ] Enable database indexing
- [ ] Configure connection pooling
- [ ] Set up caching layer
- [ ] Enable compression

## 📚 Additional Resources

- [Backend API Documentation](./README.md)
- [Frontend Component Library](./tally-client/README.md)
- [Database Schema Documentation](./src/model/README.md)
- [Email Template Customization](./src/service/emailService.ts)

## 🤝 Contributing

1. Follow the existing code structure
2. Add tests for new functionality
3. Update documentation
4. Ensure security best practices
5. Test both frontend and backend integration

---

**🎉 The voter management system is now fully connected and ready for production use!**

