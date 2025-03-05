(function() {
  var lt = window.lt || {};
  lt.d = document;
  lt.w = window;
  lt.retryAttempts = 3;
  lt.retryDelay = 1000;

  // Sistema de logging mejorado
  lt.__log = function(context, message, data) {
    if (!lt.__config__.debug) return;
    
    const timestamp = new Date().toISOString();
    const logPrefix = `[HotAPI Tracking] [${timestamp}] [${context}]`;
    
    if (data && data instanceof Error) {
      console.error(`${logPrefix} Error:`, data);
      console.trace();
    } else {
      console.log(`${logPrefix} ${message}`, data || '');
    }
  };

  if(lt._v) {
    lt.__log('Init', 'Script ya inicializado');
    return;
  }

  lt._v = '1.0';
  lt.__config__ = {
    debug: false,
    campaign_fields: [
      'utm_source', 'utm_medium', 'utm_campaign', 
      'utm_term', 'utm_content'
    ],
    iframe: window !== window.top,
    retryAttempts: 3,
    retryDelay: 1000,
    endpoints: {
      track: '/api/track'
    }
  };

  lt.accs = [];

  // Storage con fallback mejorado
  lt.__storage = {
    data: {},
    isAvailable: false,
    init: function() {
      try {
        localStorage.setItem('test', '1');
        localStorage.removeItem('test');
        this.isAvailable = true;
        lt.__log('Storage', 'LocalStorage disponible');
      } catch (e) {
        this.isAvailable = false;
        lt.__log('Storage', 'Usando fallback en memoria', e);
      }
    },
    get: function(key) {
      try {
        if (this.isAvailable) {
          return localStorage.getItem(key);
        }
        return this.data[key] || null;
      } catch (e) {
        lt.__log('Storage', 'Error obteniendo valor', e);
        return null;
      }
    },
    set: function(key, value, ttl) {
      try {
        if (this.isAvailable) {
          localStorage.setItem(key, value);
          if (ttl) {
            const expires = Date.now() + (ttl * 60 * 1000);
            localStorage.setItem(`${key}_expires`, expires.toString());
          }
        } else {
          this.data[key] = value;
        }
      } catch (e) {
        lt.__log('Storage', 'Error guardando valor', e);
      }
    },
    remove: function(key) {
      try {
        if (this.isAvailable) {
          localStorage.removeItem(key);
          localStorage.removeItem(`${key}_expires`);
        } else {
          delete this.data[key];
        }
      } catch (e) {
        lt.__log('Storage', 'Error eliminando valor', e);
      }
    }
  };

  lt.__generateUUID = function() {
    lt.__log('UUID', 'Generando nuevo UUID');
    try {
      return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
      );
    } catch (e) {
      lt.__log('UUID', 'Error generando UUID, usando fallback', e);
      return 'v_' + Math.random().toString(36).substr(2, 9);
    }
  };

  lt.__getOrCreateUniqueId = function() {
    lt.__log('VisitorID', 'Obteniendo o creando ID de visitante');
    try {
      let uniqueId = this.__storage.get('_vid');
      lt.__log('VisitorID', 'ID actual', uniqueId);
      
      if (!uniqueId) {
        uniqueId = this.__generateUUID();
        lt.__log('VisitorID', 'Nuevo ID generado', uniqueId);
        this.__storage.set('_vid', uniqueId);
      }
      return uniqueId;
    } catch (e) {
      lt.__log('VisitorID', 'Error obteniendo ID, generando nuevo', e);
      return this.__generateUUID();
    }
  };

  lt.__getFbcFbp = function() {
    lt.__log('Facebook', 'Obteniendo parámetros FBC/FBP');
    try {
      const fbp = this.__storage.get("_fbp") || "-";
      let fbc = this.__storage.get("_fbc");
      
      lt.__log('Facebook', 'Cookies encontradas', { fbp, fbc });

      if (!fbc) {
        const fbclid = new URLSearchParams(window.location.search).get("fbclid");
        if (fbclid) {
          const subdomainIndex = window.location.hostname.split(".").length - 1;
          const creationTime = Math.floor(Date.now() / 1000);
          fbc = `fb.${subdomainIndex}.${creationTime}.${fbclid}`;
          lt.__log('Facebook', 'FBC generado desde FBCLID', fbc);
        } else {
          fbc = "-";
        }
      }

      return { fbc, fbp };
    } catch (e) {
      lt.__log('Facebook', 'Error obteniendo FBC/FBP', e);
      return { fbc: "-", fbp: "-" };
    }
  };

  lt.__getBrowserInfo = function() {
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      cookiesEnabled: navigator.cookieEnabled
    };
  };

  lt.__getScreenInfo = function() {
    return {
      screen_resolution: `${window.screen.width}x${window.screen.height}`,
      viewport_size: `${window.innerWidth}x${window.innerHeight}`
    };
  };

  lt.__getUtmParams = function() {
    const params = new URLSearchParams(window.location.search);
    const utmData = {};
    
    this.__config__.campaign_fields.forEach(field => {
      const value = params.get(field);
      if (value) {
        utmData[field] = value;
      }
    });

    return utmData;
  };

  lt.__send_to_backend = async function(data, retryCount = 0) {
    lt.__log('Backend', 'Enviando datos al backend', { data, retryCount });
    try {
      const currentScript = document.currentScript || 
        document.querySelector('script[data-tracking-id]');
      
      if (!currentScript) {
        throw new Error('No se pudo encontrar el script de tracking');
      }

      const scriptUrl = currentScript.src;
      const baseUrl = scriptUrl.substring(0, scriptUrl.lastIndexOf('/track.js'));
      lt.__log('Backend', 'URL base detectada', baseUrl);

      // Enriquecer los datos con información adicional
      const { fbc, fbp } = this.__getFbcFbp();
      const browserInfo = this.__getBrowserInfo();
      const screenInfo = this.__getScreenInfo();
      const utmData = this.__getUtmParams();

      const enrichedData = {
        ...data,
        referrer: document.referrer,
        user_agent: browserInfo.userAgent,
        ...screenInfo,
        event_data: {
          ...data.event_data,
          browser_info: browserInfo,
          fbc,
          fbp,
          utm_data: utmData
        }
      };
      
      const headers = {
        'Content-Type': 'application/json',
        'X-Tracking-ID': enrichedData.tracking_id,
        'X-Visitor-ID': enrichedData.visitor_id
      };

      const payload = JSON.stringify(enrichedData);
      
      try {
        if (navigator.sendBeacon) {
          lt.__log('Backend', 'Usando sendBeacon');
          const blob = new Blob([payload], { type: 'application/json' });
          const success = navigator.sendBeacon(`${baseUrl}/api/track`, blob);
          
          if (success) {
            lt.__log('Backend', 'SendBeacon exitoso');
            return;
          }
          throw new Error('SendBeacon falló');
        }
      } catch (e) {
        lt.__log('Backend', 'Error con sendBeacon, usando fetch', e);
      }

      const response = await fetch(`${baseUrl}/api/track`, {
        method: 'POST',
        headers,
        body: payload,
        keepalive: true
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      lt.__log('Backend', 'Respuesta del servidor', result);

    } catch (error) {
      lt.__log('Backend', 'Error enviando datos', error);

      if (retryCount < lt.retryAttempts) {
        lt.__log('Backend', `Reintentando en ${lt.retryDelay}ms`, { attempt: retryCount + 1 });
        setTimeout(() => {
          lt.__send_to_backend(data, retryCount + 1);
        }, lt.retryDelay * Math.pow(2, retryCount));
      } else {
        lt.__log('Backend', 'Máximo de reintentos alcanzado');
      }
    }
  };

  lt.__init__ = function() {
    lt.__log('Init', 'Iniciando script de tracking');
    try {
      // Inicializar storage
      this.__storage.init();

      this.dom = this.__get_TLD();
      lt.__log('Init', 'Dominio detectado', this.dom);

      this.visitorId = this.__getOrCreateUniqueId();
      lt.__log('Init', 'ID de visitante', this.visitorId);

      if(this.pvid) {
        lt.__log('Init', 'PageView ID ya existe');
        return;
      }

      this.pvid = new Date().getTime();
      lt.__log('Init', 'Nuevo PageView ID', this.pvid);

      this.__url_params__ = this.__get_params();
      lt.__log('Init', 'Parámetros URL', this.__url_params__);

      this.__check_session_changed();

      var c = this._c.slice();
      lt.__log('Init', 'Comandos pendientes', c);

      this._c.push = function(arr) {
        lt.__log('Command', 'Nuevo comando', arr);
        lt.__proc_cmd(arr[0], arr[1]);
      };

      for(var x = 0; x < c.length; x++){
        lt.__proc_cmd(c[x][0], c[x][1]);
      }
    } catch (e) {
      lt.__log('Init', 'Error en inicialización', e);
    }
  };

  if(!window._lt) window._lt = [];
  lt._c = window._lt;
  window._lt = lt;
  lt.__init__();
})();