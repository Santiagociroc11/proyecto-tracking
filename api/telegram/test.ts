import { sendTestNotification } from '../telegram.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { chatId, userId } = req.body;

    if (!chatId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Chat ID es requerido' 
      });
    }

    const result = await sendTestNotification(chatId, userId);

    if (result.success) {
      return res.status(200).json({ 
        success: true, 
        message: 'Notificación de prueba enviada exitosamente' 
      });
    } else {
      return res.status(400).json({ 
        success: false, 
        error: result.error || 'Error desconocido' 
      });
    }

  } catch (error) {
    console.error('Error in test notification endpoint:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor' 
    });
  }
} 