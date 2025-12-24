# Authentication API Documentation

## Endpoints

### POST /auth/register

Register a new user.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe",
  "role": "team_owner",
  "teamId": "507f1f77bcf86cd799439011" // Optional, required for team_owner
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "team_owner",
      "teamId": "507f1f77bcf86cd799439011",
      "isActive": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Response (400/409):**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Please provide a valid email address"
    }
  ]
}
```

---

### POST /auth/login

Login user and receive JWT token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "team_owner",
      "teamId": "507f1f77bcf86cd799439011",
      "isActive": true,
      "lastLogin": "2024-01-01T00:00:00.000Z",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Response (401):**
```json
{
  "success": false,
  "message": "Invalid email or password"
}
```

---

## Validation Rules

### Register
- **email**: Valid email format, max 100 characters
- **password**: Minimum 8 characters, max 128 characters
- **name**: 2-100 characters, letters, spaces, hyphens, apostrophes only
- **role**: Optional, must be one of: `admin`, `auctioneer`, `team_owner` (default: `team_owner`)
- **teamId**: Optional, must be valid MongoDB ObjectId (required if role is `team_owner`)

### Login
- **email**: Valid email format
- **password**: Required

---

## JWT Token

- Token is included in response after successful registration/login
- Include token in Authorization header for protected routes: `Authorization: Bearer <token>`
- Token expires in 7 days (configurable via `JWT_EXPIRE` environment variable)

---

## Required Dependencies

```json
{
  "express": "^4.18.2",
  "jsonwebtoken": "^9.0.0",
  "express-validator": "^7.0.1",
  "dotenv": "^16.3.1",
  "cors": "^2.8.5",
  "mongoose": "^7.0.0",
  "bcryptjs": "^2.4.3"
}
```

