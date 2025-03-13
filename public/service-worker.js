// Service Worker for Push Notifications
self.addEventListener('push', function(event) {
    try {
      const data = JSON.parse(event.data.text());
      
      const options = {
        body: data.body,
        icon: '/notification-icon.png',
        badge: '/notification-badge.png',
        vibrate: [100, 50, 100],
        data: data.data,
        actions: [
          {
            action: 'view',
            title: 'Ver detalles'
          }
        ]
      };
  
      event.waitUntil(
        self.registration.showNotification(data.title, options)
      );
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  });
  
  self.addEventListener('notificationclick', function(event) {
    event.notification.close();
  
    if (event.action === 'view' && event.notification.data?.type === 'purchase') {
      // Open dashboard with purchase details
      event.waitUntil(
        clients.openWindow(`/dashboard?purchase=${event.notification.data.purchaseId}`)
      );
    } else {
      event.waitUntil(
        clients.openWindow('/')
      );
    }
  });