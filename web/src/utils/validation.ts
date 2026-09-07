import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().min(1, 'Enter your email').email('That email does not look right'),
  password: z.string().min(8, 'Use at least 8 characters'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = loginSchema.extend({
  fullName: z.string().min(2, 'Enter your name'),
  businessName: z.string().min(2, 'Enter your business name'),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const productSchema = z.object({
  name: z.string().min(2, 'Enter a product name'),
  description: z.string().max(600, 'Keep it under 600 characters').default(''),
  price: z.coerce.number().positive('Price must be more than 0'),
  stock: z.coerce.number().int('Whole numbers only').min(0, 'Stock cannot be negative'),
  category: z.string().min(1, 'Enter a category'),
  published: z.boolean().default(true),
});
export type ProductInput = z.infer<typeof productSchema>;
