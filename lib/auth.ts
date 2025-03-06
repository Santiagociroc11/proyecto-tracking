import { supabase } from './supabase';

export async function checkUserAccess(userId: string, resourceUserId: string): Promise<boolean> {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    return user?.role === 'admin' || userId === resourceUserId;
  } catch (error) {
    console.error('Error checking user access:', error);
    return false;
  }
}

export async function validateProductAccess(userId: string, productId: string): Promise<boolean> {
  try {
    const { data: product } = await supabase
      .from('products')
      .select('user_id')
      .eq('id', productId)
      .single();

    return product ? await checkUserAccess(userId, product.user_id) : false;
  } catch (error) {
    console.error('Error validating product access:', error);
    return false;
  }
}

export async function validateTrackingAccess(userId: string, productId: string): Promise<boolean> {
  return validateProductAccess(userId, productId);
}