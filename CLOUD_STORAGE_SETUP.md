# Cloud Storage Setup Guide

This application uses **Cloudinary** for image storage, which allows images to be stored and served reliably in both local development and serverless (Vercel) environments.

## Why Cloudinary?

- ✅ Works perfectly with serverless environments (Vercel)
- ✅ Free tier available (10GB storage, 10GB bandwidth/month)
- ✅ Automatic image optimization and transformations
- ✅ CDN delivery for fast image loading
- ✅ Easy to set up and use

## Setup Instructions

### Step 1: Create a Cloudinary Account

1. Go to [https://cloudinary.com/users/register/free](https://cloudinary.com/users/register/free)
2. Sign up for a free account (no credit card required)
3. You'll be redirected to your dashboard

### Step 2: Get Your API Credentials

1. In your Cloudinary dashboard, you'll see your **Cloud Name**, **API Key**, and **API Secret**
2. Copy these three values (you'll need them in the next step)

### Step 3: Configure Environment Variables

Add the following environment variables to your `.env` file in the `backend` directory:

```env
CLOUDINARY_CLOUD_NAME=your_cloud_name_here
CLOUDINARY_API_KEY=your_api_key_here
CLOUDINARY_API_SECRET=your_api_secret_here
```

**For Vercel Deployment:**

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the three Cloudinary variables:
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`
4. Make sure to add them for **Production**, **Preview**, and **Development** environments
5. Redeploy your application

### Step 4: Install Dependencies

Run the following command in your `backend` directory:

```bash
npm install
```

This will install the `cloudinary` package that was added to `package.json`.

## How It Works

### Image Upload Flow

1. **Local Development:**
   - Images are uploaded to Cloudinary from the local file system
   - The returned Cloudinary URL is stored in the database

2. **Vercel/Serverless:**
   - Images are uploaded directly from memory buffer to Cloudinary
   - The returned Cloudinary URL is stored in the database

3. **Database Storage:**
   - Only the Cloudinary URL is stored (e.g., `https://res.cloudinary.com/your-cloud/image/upload/v1234567890/cricket-auction/teams/team-logo.jpg`)
   - Images are never stored in your database or filesystem

### Image Organization

Images are organized in Cloudinary with the following folder structure:
- `cricket-auction/teams/` - Team logos
- `cricket-auction/players/` - Player photos

### Automatic Features

- **Automatic Image Optimization:** Cloudinary automatically optimizes images for web delivery
- **CDN Delivery:** Images are delivered via Cloudinary's global CDN for fast loading
- **Automatic Deletion:** When updating images, old images are automatically deleted from Cloudinary
- **Unique Filenames:** Duplicate filenames are automatically handled with unique suffixes

## Fallback Behavior

If Cloudinary is not configured (environment variables missing):
- **Local Development:** Images will be saved to the local `uploads/` directory (existing behavior)
- **Serverless/Vercel:** Image uploads will be skipped (no crash, just a warning in logs)

## Testing

After setup, test the image upload functionality:

1. Try creating a team with a logo
2. Try creating a player with a photo
3. Check that the image URLs returned are Cloudinary URLs
4. Verify images load correctly in your frontend

## Troubleshooting

### Images not uploading?

1. Check that all three environment variables are set correctly
2. Verify your Cloudinary credentials in the dashboard
3. Check server logs for error messages
4. Ensure the `cloudinary` package is installed (`npm install`)

### Images uploading but not displaying?

1. Verify the Cloudinary URL is being saved to the database
2. Check that the URL is accessible in your browser
3. Ensure CORS is configured correctly (should already be set up)

### Need to switch to a different cloud storage provider?

The code is structured to make it easy to switch providers. You would need to:
1. Create a new service file (similar to `cloudStorage.service.js`)
2. Implement the same interface (`uploadImage`, `uploadImageFromPath`, `deleteImage`, `isConfigured`)
3. Update the controllers to use the new service

## Alternative Storage Options

If you prefer a different storage provider:

- **AWS S3:** Popular, scalable, pay-per-use
- **Vercel Blob Storage:** Native Vercel solution (requires Vercel Pro plan)
- **ImageKit:** Image-focused CDN with optimization
- **Google Cloud Storage:** Similar to S3

For any of these, you would need to modify the `cloudStorage.service.js` file accordingly.

## Support

For Cloudinary-specific issues, check their documentation:
- [Cloudinary Node.js SDK Documentation](https://cloudinary.com/documentation/node_integration)
- [Cloudinary Console/Dashboard](https://console.cloudinary.com/)

