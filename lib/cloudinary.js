import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

// Load env (safe to call multiple times; server already loads dotenv too)
dotenv.config();

// Configure Cloudinary from environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const uploadToCloudinary = async (base64String, publicId) => {
  try {
    const result = await cloudinary.uploader.upload(base64String, {
      public_id: publicId,
      overwrite: true,
      resource_type: 'auto'
    });
    return result;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
};

export default cloudinary;
