# Backend Vercel Deployment Guide

## ⚠️ Important Notes

### Socket.io Limitation
**Socket.io will NOT work on Vercel serverless functions.** Vercel serverless functions are stateless and don't support persistent WebSocket connections. If you need real-time features, consider:
- Using a separate service for Socket.io (e.g., Railway, Render, or a dedicated server)
- Using Vercel's Edge Functions with alternative real-time solutions
- Using Server-Sent Events (SSE) instead of WebSockets

### File Uploads
Static file serving (`/uploads`) won't work on Vercel serverless. Consider:
- Using Vercel Blob Storage
- Using AWS S3 or similar cloud storage
- Using a separate service for file storage

## Deployment Steps

### 1. Set Root Directory in Vercel Dashboard

**CRITICAL:** You MUST set the Root Directory in Vercel Dashboard:

1. Go to your Vercel project: https://vercel.com/dashboard
2. Select your project
3. Go to **Settings** → **General**
4. Scroll to **Root Directory**
5. Set it to: `backend`
6. Click **Save**

### 2. Environment Variables

Set the following environment variables in Vercel Dashboard (Settings → Environment Variables):

**Required:**
- `MONGODB_URI` - Your MongoDB connection string
- `JWT_SECRET` - Secret key for JWT tokens (use a strong random string)
- `JWT_REFRESH_SECRET` - Secret key for refresh tokens
- `NODE_ENV` - Set to `production`

**Optional:**
- `JWT_EXPIRE` - JWT expiration (default: `7d`)
- `JWT_REFRESH_EXPIRE` - Refresh token expiration (default: `30d`)
- `CORS_ORIGIN` - CORS origin (default: `*`)

### 3. Project Structure

The backend should have this structure:
```
backend/
├── api/
│   └── index.js          # Vercel serverless entry point
├── src/
│   ├── server.js         # Express app
│   ├── config/
│   ├── controllers/
│   ├── models/
│   ├── routes/
│   ├── middleware/
│   └── ...
├── vercel.json           # Vercel configuration
└── package.json
```

### 4. Vercel Configuration

The `vercel.json` file is already configured:
- Builds from `api/index.js`
- Routes all requests to the serverless function
- Sets CORS headers

### 5. Deploy

1. Push your code to GitHub/GitLab/Bitbucket
2. Connect your repository to Vercel
3. Set Root Directory to `backend` (see step 1)
4. Add environment variables (see step 2)
5. Deploy

## Troubleshooting

### MongoDB Connection Issues

**Error:** `MongoDB Connection Error`

**Solutions:**
1. Verify `MONGODB_URI` is set correctly in Vercel environment variables
2. Check MongoDB Atlas IP whitelist - add `0.0.0.0/0` to allow all IPs (or Vercel's IP ranges)
3. Check MongoDB connection string format
4. Verify network access in MongoDB Atlas

### Function Timeout

**Error:** Function execution timeout

**Solutions:**
1. Vercel free tier has 10s timeout for Hobby plan
2. Optimize database queries
3. Use connection pooling (already implemented)
4. Consider upgrading to Pro plan for longer timeouts

### CORS Issues

**Error:** CORS errors from frontend

**Solutions:**
1. Check CORS headers in `vercel.json`
2. Verify `CORS_ORIGIN` environment variable
3. Check frontend API URL configuration

### Build Failures

**Error:** Build fails during deployment

**Solutions:**
1. Verify Root Directory is set to `backend`
2. Check `package.json` has all dependencies
3. Ensure `api/index.js` exists and exports correctly
4. Check build logs in Vercel dashboard

## Testing Deployment

After deployment, test these endpoints:

1. **Health Check:**
   ```
   GET https://your-project.vercel.app/health
   ```

2. **API Endpoints:**
   ```
   GET https://your-project.vercel.app/api/events
   POST https://your-project.vercel.app/api/auth/login
   ```

## Current Configuration

- **Entry Point:** `api/index.js`
- **Framework:** Express.js
- **Database:** MongoDB (Atlas)
- **Authentication:** JWT
- **File Uploads:** Disabled on Vercel (use cloud storage)
- **Socket.io:** Disabled on Vercel (use separate service)

## Next Steps

1. ✅ Set Root Directory to `backend` in Vercel
2. ✅ Add environment variables
3. ✅ Deploy and test
4. ⚠️ Set up separate service for Socket.io (if needed)
5. ⚠️ Set up cloud storage for file uploads (if needed)

