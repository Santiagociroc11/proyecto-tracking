(function() {
  var lt = window.lt || {};
  lt.d = document;
  lt.w = window;

  // Sistema de logging
  lt.__log = function(context, message, data) {
    if (data && data instanceof Error) {
      console.error(`[HotAPI Tracking] Error en ${context}:`, data);
      console.trace();
    } else {
      console.log(`[HotAPI Tracking] ${context}: ${message}`, data || '');
    }
  };

  if(lt._v) {
    lt.__log('Init', 'Script ya inicializado');
    return;
  }

  lt._v = '1.0';
  lt.__config__ = {
    campaign_fields: [
      'utm_source', 'utm_medium', 'utm_campaign', 
      'utm_term', 'utm_content'
    ],
    iframe: window !== window.top
  };

  lt.accs = [];

  // Storage fallback
  lt.__storage = {
    data: {},
    isAvailable: false,
    init: function() {
      try {
        // Test cookie access
        document.cookie = "test=1";
        var cookieEnabled = document.cookie.indexOf("test=") !== -1;
        document.cookie = "test=1; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        
        this.isAvailable = cookieEnabled;
        lt.__log('Storage', 'Estado de almacenamiento', { 
          cookies: cookieEnabled 
        });
      } catch (e) {
        this.isAvailable = false;
        lt.__log('Storage', 'Error verificando almacenamiento', e);
      }
    },
    get: function(key) {
      if (this.isAvailable) {
        return lt.__get_cookie(key);
      }
      return this.data[key] || null;
    },
    set: function(key, value, ttl) {
      if (this.isAvailable) {
        lt.__set_cookie(key, value, ttl);
      } else {
        this.data[key] = value;
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

  lt.__proc_cmd = function(k, v) {
    lt.__log('Command', 'Procesando comando', { comando: k, valor: v });
    try {
      if(k === 'init') {
        var trackingId = v;
        if(this.accs.indexOf(trackingId) >= 0) {
          lt.__log('Command', 'Tracking ID ya inicializado', trackingId);
          return;
        }
        this.accs.push(trackingId);
        lt.__log('Command', 'Nuevo tracking ID agregado', trackingId);

        if(this.visitorId) {
          this.__register_pv(trackingId);
          this.__track_user_interaction(trackingId);
        }
      }
      else if(k === 'event'){
        this.__register_event(v);
      }
    } catch (e) {
      lt.__log('Command', 'Error procesando comando', e);
    }
  };

  lt.__check_session_changed = function() {
    lt.__log('Session', 'Verificando cambios en sesión');
    try {
      let cookie = this.__storage.get('_ltsession');
      lt.__log('Session', 'Cookie de sesión actual', cookie);

      var current_campaign = this.__get_current_campaign();
      var session_campaign = current_campaign;
      var current_time = new Date().getTime();
      var session_time = current_time;
      this.session_id = 'sess_' + Math.random().toString(36).substr(2, 9);

      if(cookie){
        var parts = cookie.split("_");
        if(parts.length === 3) {
          session_time = parseInt(parts[0]);
          session_campaign = parts[1];
          this.session_id = parts[2];
          lt.__log('Session', 'Sesión existente encontrada', {
            session_time,
            session_campaign,
            session_id: this.session_id
          });
        }
      }

      var diff_seconds = (current_time - session_time) / 1000.0;
      if(diff_seconds > (30 * 60) || (current_campaign && current_campaign !== session_campaign)){
        this.session_id = 'sess_' + Math.random().toString(36).substr(2, 9);
        lt.__log('Session', 'Nueva sesión creada', this.session_id);
      }
      
      cookie = current_time + '_' + current_campaign + '_' + this.session_id;
      this.__storage.set('_ltsession', cookie);
      lt.__log('Session', 'Cookie de sesión actualizada', cookie);
    } catch (e) {
      lt.__log('Session', 'Error en verificación de sesión', e);
    }
  };

  lt.__get_current_campaign = function() {
    lt.__log('Campaign', 'Obteniendo datos de campaña');
    try {
      var campaign = {};
      this.__config__.campaign_fields.forEach(field => {
        var value = this.__url_params__[field];
        if(value) campaign[field] = decodeURIComponent(value);
      });
      lt.__log('Campaign', 'Datos encontrados', campaign);
      return Object.keys(campaign).length ? btoa(JSON.stringify(campaign)) : '';
    } catch (e) {
      lt.__log('Campaign', 'Error obteniendo campaña', e);
      return '';
    }
  };

  lt.__register_pv = function(trackingId) {
    lt.__log('PageView', 'Registrando vista de página');
    try {
      var eventData = {
        type: 'pageview',
        tracking_id: trackingId,
        visitor_id: this.visitorId,
        session_id: this.session_id,
        page_view_id: this.pvid,
        timestamp: new Date().toISOString(),
        url: this.__config__.iframe ? document.referrer : document.URL,
        referrer: document.referrer || '',
        campaign_data: this.__get_current_campaign(),
        user_agent: navigator.userAgent,
        screen_resolution: window.screen.width + 'x' + window.screen.height,
        viewport_size: window.innerWidth + 'x' + window.innerHeight,
        encoding: document.characterSet || document.charset,
        title: document.title,
        in_iframe: this.__config__.iframe
      };

      lt.__log('PageView', 'Datos del evento', eventData);
      this.__send_to_backend(eventData);
    } catch (e) {
      lt.__log('PageView', 'Error registrando vista de página', e);
    }
  };

  lt.__register_event = function(event) {
    lt.__log('Event', 'Registrando evento personalizado');
    try {
      var eventData = typeof event === "object" ? event : { name: event };
      lt.__log('Event', 'Datos del evento', eventData);
      
      this.accs.forEach(trackingId => {
        var data = {
          type: eventData.type || 'custom',
          tracking_id: trackingId,
          visitor_id: this.visitorId,
          session_id: this.session_id,
          page_view_id: this.pvid,
          timestamp: new Date().toISOString(),
          url: window.location.href,
          event_data: eventData,
          in_iframe: this.__config__.iframe
        };

        this.__send_to_backend(data);
      });
    } catch (e) {
      lt.__log('Event', 'Error registrando evento', e);
    }
  };

  lt.__track_user_interaction = function(trackingId) {
    lt.__log('Interaction', 'Iniciando tracking de interacciones');
    try {
      document.addEventListener('click', (event) => {
        const target = event.target.closest('a');
        if (target && target.href && target.href.includes('hotmart')) {
          event.preventDefault();
          lt.__log('Interaction', 'Click en enlace Hotmart', target.href);
          
          const { fbc, fbp } = this.__getFbcFbp();
          const browserInfo = {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            cookiesEnabled: navigator.cookieEnabled
          };

          const hotmartData = {
            type: 'hotmart_click',
            visitor_id: this.visitorId,
            session_id: this.session_id,
            page_view_id: this.pvid,
            url: target.href,
            fbc: fbc,
            fbp: fbp,
            browser_info: browserInfo,
            utm_data: this.__get_utm_data(),
            in_iframe: this.__config__.iframe
          };

          lt.__log('Interaction', 'Datos de click en Hotmart', hotmartData);
          this.__register_event(hotmartData);

          const urlWithId = new URL(target.href);
          urlWithId.searchParams.append('xcod', this.visitorId);
          lt.__log('Interaction', 'Redirigiendo a', urlWithId.toString());
          window.location.assign(urlWithId.toString());
        }
      });
    } catch (e) {
      lt.__log('Interaction', 'Error en tracking de interacciones', e);
    }
  };

  lt.__get_utm_data = function() {
    lt.__log('UTM', 'Obteniendo datos UTM');
    try {
      const utmParams = {};
      const searchParams = new URLSearchParams(window.location.search);
      
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(param => {
        utmParams[param] = searchParams.get(param) || '-';
      });
      
      lt.__log('UTM', 'Parámetros encontrados', utmParams);
      return utmParams;
    } catch (e) {
      lt.__log('UTM', 'Error obteniendo datos UTM', e);
      return {};
    }
  };

  lt.__send_to_backend = function(data) {
    lt.__log('Backend', 'Enviando datos al backend');
    try {
      const currentScript = document.currentScript || 
        document.querySelector('script[data-tracking-id]');
      
      if (!currentScript) {
        throw new Error('No se pudo encontrar el script de tracking');
      }

      const scriptUrl = currentScript.src;
      const baseUrl = scriptUrl.substring(0, scriptUrl.lastIndexOf('/'));
      lt.__log('Backend', 'URL base detectada', baseUrl);
      
      const sendBeacon = navigator.sendBeacon && navigator.sendBeacon.bind(navigator);
      
      if (sendBeacon) {
        lt.__log('Backend', 'Usando sendBeacon');
        const blob = new Blob([JSON.stringify(data)], {
          type: 'application/json'
        });
        const success = sendBeacon(baseUrl + '/api/track', blob);
        lt.__log('Backend', 'Resultado sendBeacon', success);
      } else {
        lt.__log('Backend', 'Usando fetch');
        fetch(baseUrl + '/api/track', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(data),
          keepalive: true
        }).then(response => {
          lt.__log('Backend', 'Respuesta fetch', response.status);
        }).catch(error => {
          lt.__log('Backend', 'Error en fetch', error);
        });
      }
    } catch (e) {
      lt.__log('Backend', 'Error enviando datos', e);
    }
  };

  lt.__get_TLD = function() {
    lt.__log('Domain', 'Obteniendo dominio principal');
    try {
      var hostname = window.location.hostname;
      var parts = hostname.split('.');
      if(parts.length <= 2) return '.' + hostname;
      return '.' + parts.slice(-2).join('.');
    } catch (e) {
      lt.__log('Domain', 'Error obteniendo dominio', e);
      return '';
    }
  };

  lt.__set_cookie = function(name, value, ttl) {
    lt.__log('Cookie', `Estableciendo cookie: ${name}`);
    try {
      var d = new Date();
      if (!ttl || ttl !== ttl) ttl = 365 * 24 * 60;
      d.setTime(d.getTime() + (ttl * 60 * 1000));
      var expires = "expires=" + d.toUTCString();
      document.cookie = name + "=" + value + ";" + expires + ";path=/;SameSite=Lax";
      lt.__log('Cookie', 'Cookie establecida correctamente');
    } catch (e) {
      lt.__log('Cookie', 'Error estableciendo cookie', e);
    }
  };

  lt.__get_cookie = function(name) {
    lt.__log('Cookie', `Obteniendo cookie: ${name}`);
    try {
      var nameEQ = name + "=";
      var ca = document.cookie.split(';');
      for(var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) == 0) {
          const value = c.substring(nameEQ.length, c.length);
          lt.__log('Cookie', 'Valor encontrado', value);
          return value;
        }
      }
      lt.__log('Cookie', 'Cookie no encontrada');
      return null;
    } catch (e) {
      lt.__log('Cookie', 'Error obteniendo cookie', e);
      return null;
    }
  };

  lt.__get_params = function() {
    lt.__log('URL', 'Obteniendo parámetros de URL');
    try {
      var params = {};
      var search = window.location.search.substring(1);
      var pairs = search.split('&');
      for(var i = 0; i < pairs.length; i++) {
        var pair = pairs[i].split('=');
        if(pair[0]) params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || '');
      }
      lt.__log('URL', 'Parámetros encontrados', params);
      return params;
    } catch (e) {
      lt.__log('URL', 'Error obteniendo parámetros', e);
      return {};
    }
  };

  if(!window._lt) window._lt = [];
  lt._c = window._lt;
  window._lt = lt;
  lt.__init__();
})();