import { Link } from 'react-router-dom';

export default function LandingPage() {
  return (
    <div className="antialiased" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", backgroundColor: '#0B0F19', color: '#E2E8F0' }}>
      
      {/* Custom Styles */}
      <style>{`
        .gradient-text {
          background: linear-gradient(90deg, #8B5CF6, #EC4899);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .cta-button {
          background: linear-gradient(90deg, #6D28D9, #4F46E5);
          transition: all 0.3s ease;
          box-shadow: 0 4px 20px rgba(109, 40, 217, 0.3);
        }
        .cta-button:hover {
          transform: translateY(-3px);
          box-shadow: 0 7px 30px rgba(109, 40, 217, 0.5);
        }
        .section-glow {
          position: relative;
        }
        .section-glow::before {
          content: '';
          position: absolute;
          top: -100px;
          left: 50%;
          transform: translateX(-50%);
          width: 50%;
          height: 200px;
          background: radial-gradient(circle, rgba(109, 40, 217, 0.15) 0%, rgba(109, 40, 217, 0) 70%);
          z-index: 0;
          pointer-events: none;
        }
        .card {
          background-color: rgba(30, 41, 59, 0.5);
          border: 1px solid #334155;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }
      `}</style>

      {/* Header / Nav */}
      <header className="bg-black/50 backdrop-blur-lg sticky top-0 z-50 border-b border-slate-800">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-white">Hot<span className="text-violet-500">API</span></h2>
          <nav className="hidden md:flex items-center space-x-8">
            <a href="#problema" className="text-slate-300 hover:text-white transition-colors">El Problema</a>
            <a href="#solucion" className="text-slate-300 hover:text-white transition-colors">La Solución</a>
            <a href="#poder" className="text-slate-300 hover:text-white transition-colors">El Poder</a>
            <a href="#faq" className="text-slate-300 hover:text-white transition-colors">FAQ</a>
          </nav>
          <Link to="/login" className="bg-slate-700 hover:bg-slate-600 text-white font-semibold px-5 py-2 rounded-lg transition-colors">
            Iniciar Sesión
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main>
        <section className="py-24 md:py-32 text-center section-glow">
          <div className="container mx-auto px-6 relative z-10">
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold text-white leading-tight">
              Estás Quemando Dinero en Anuncios. <br/> Y <span className="gradient-text">Ni Siquiera lo Sabes.</span>
            </h1>
            <p className="mt-6 max-w-3xl mx-auto text-lg md:text-xl text-slate-400">
              El "agujero negro" entre tus campañas de Meta y tus ventas en Hotmart te está costando una fortuna. Es hora de encender la luz.
            </p>
            <div className="mt-10">
              <Link to="/login" className="cta-button text-white font-bold text-lg px-8 py-4 rounded-full inline-block">
                Descubre la Verdad de tu ROAS en 5 Minutos
              </Link>
              <p className="mt-4 text-sm text-slate-500">Sin tarjeta de crédito. Conecta y ve.</p>
            </div>
          </div>
        </section>

        {/* El Problema (Pain Section) */}
        <section id="problema" className="py-20 md:py-28 bg-black">
          <div className="container mx-auto px-6">
            <div className="text-center max-w-3xl mx-auto">
              <h2 className="text-3xl md:text-5xl font-bold text-white">El Juego está <span className="text-red-500">Arreglado</span> en tu Contra</h2>
              <p className="mt-4 text-lg text-slate-400">Si vendes infoproductos, vives esta pesadilla todos los días.</p>
            </div>

            <div className="mt-16 grid md:grid-cols-2 gap-12 items-center">
              <div className="space-y-6 text-lg text-slate-300">
                <p>Inviertes $1,000, $5,000, $10,000 en Meta Ads. Ves clics, alcance, incluso "compras" en el Ads Manager.</p>
                <p>Luego vas a Hotmart. Las ventas no cuadran. Empieza la cacería: ¿qué anuncio funcionó? ¿Qué campaña es un pozo sin fondo?</p>
                <p>Abres una hoja de cálculo. Exportas datos. Intentas cruzar UTMs sucios y duplicados. Para cuando crees tener una respuesta, <strong className="text-white">ya has quemado miles de dólares más en la campaña equivocada.</strong></p>
                <p className="text-xl font-semibold text-white border-l-4 border-violet-500 pl-4">La falta de datos en tiempo real no es un inconveniente. Es un <span className="text-violet-400">ladrón silencioso</span> que vacía tu cuenta bancaria.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="card p-6 rounded-xl">
                  <h3 className="text-xl font-bold text-white">Ads Manager Miente</h3>
                  <p className="mt-2 text-slate-400">El píxel es optimista. iOS14 lo destrozó. Te muestra "compras" que nunca existieron. Estás optimizando con datos falsos.</p>
                </div>
                <div className="card p-6 rounded-xl mt-8">
                  <h3 className="text-xl font-bold text-white">Hojas de Cálculo Asesinas</h3>
                  <p className="mt-2 text-slate-400">Horas perdidas, datos desactualizados y errores humanos. El ROAS que calculas hoy era válido... la semana pasada.</p>
                </div>
                <div className="card p-6 rounded-xl">
                  <h3 className="text-xl font-bold text-white">El Retraso te Cuesta Caro</h3>
                  <p className="mt-2 text-slate-400">Decidir apagar un anuncio 24 horas tarde puede ser la diferencia entre la ganancia y la pérdida de todo tu lanzamiento.</p>
                </div>
                <div className="card p-6 rounded-xl mt-8">
                  <h3 className="text-xl font-bold text-white">Order Bumps Invisibles</h3>
                  <p className="mt-2 text-slate-400">¿Sabes qué anuncio genera más ventas con Order Bumps? Probablemente no. Estás dejando sobre la mesa el dinero más fácil.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* La Solución (Mechanism Section) */}
        <section id="solucion" className="py-20 md:py-28 section-glow">
          <div className="container mx-auto px-6">
            <div className="text-center max-w-3xl mx-auto">
              <h2 className="text-3xl md:text-5xl font-bold text-white">HotAPI: Tu <span className="gradient-text">Fuente de la Verdad</span></h2>
              <p className="mt-4 text-lg text-slate-400">No somos "otro dashboard". Somos un puente directo, sin intermediarios, entre tu dinero gastado y tu dinero ganado.</p>
            </div>

            <div className="mt-16 max-w-5xl mx-auto grid md:grid-cols-3 gap-8 text-center">
              {/* Step 1 */}
              <div className="card p-8 rounded-xl">
                <div className="text-5xl font-bold text-violet-500">1</div>
                <h3 className="mt-4 text-2xl font-bold text-white">Conecta Hotmart</h3>
                <p className="mt-2 text-slate-400">Autoriza el acceso a tus datos de ventas con un clic. Usamos la API oficial. Es 100% seguro.</p>
              </div>
              {/* Step 2 */}
              <div className="card p-8 rounded-xl">
                <div className="text-5xl font-bold text-violet-500">2</div>
                <h3 className="mt-4 text-2xl font-bold text-white">Conecta Meta</h3>
                <p className="mt-2 text-slate-400">Autoriza el acceso de lectura a tus campañas. Jamás modificaremos nada sin tu permiso explícito.</p>
              </div>
              {/* Step 3 */}
              <div className="card p-8 rounded-xl">
                <div className="text-5xl font-bold text-violet-500">3</div>
                <h3 className="mt-4 text-2xl font-bold text-white">Gana Claridad Absoluta</h3>
                <p className="mt-2 text-slate-400">En tiempo real, mira tu gasto, tus ingresos y tu ROAS real por campaña, conjunto y anuncio. Sin adivinar. Nunca más.</p>
              </div>
            </div>
            
            <div className="mt-16 text-center">
              <Link to="/login" className="cta-button text-white font-bold text-lg px-8 py-4 rounded-full inline-block">
                Dejar de Adivinar AHORA
              </Link>
            </div>
          </div>
        </section>

        {/* El Poder (Features/Benefits Section) */}
        <section id="poder" className="py-20 md:py-28 bg-black">
          <div className="container mx-auto px-6">
            <div className="text-center max-w-3xl mx-auto">
              <h2 className="text-3xl md:text-5xl font-bold text-white">Esto no es Información. Es <span className="text-green-400">Poder.</span></h2>
              <p className="mt-4 text-lg text-slate-400">Te damos las herramientas para tomar decisiones de un millón de dólares, al instante.</p>
            </div>

            <div className="mt-16 grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              <div className="card p-6 rounded-xl border-t-4 border-green-500">
                <h3 className="text-xl font-bold text-white">Dashboard de ROAS Real</h3>
                <p className="mt-2 text-slate-400">Tu gasto en Meta al lado de tus ingresos de Hotmart. Actualizado al minuto. Identifica ganadores y perdedores de un vistazo.</p>
              </div>
              <div className="card p-6 rounded-xl border-t-4 border-green-500">
                <h3 className="text-xl font-bold text-white">Atribución de Ventas Perfecta</h3>
                <p className="mt-2 text-slate-400">Conectamos cada venta (incluyendo Order Bumps) al anuncio exacto que la generó. Nuestro sistema limpia y unifica tus UTMs automáticamente.</p>
              </div>
              <div className="card p-6 rounded-xl border-t-4 border-green-500">
                <h3 className="text-xl font-bold text-white">Integración con CAPI de Meta</h3>
                <p className="mt-2 text-slate-400">Enviamos eventos de compra enriquecidos (con datos del comprador hasheados) a la API de Conversiones. Esto sobrealimenta el algoritmo de Meta para que encuentre más compradores como los que ya tienes.</p>
              </div>
              <div className="card p-6 rounded-xl border-t-4 border-green-500">
                <h3 className="text-xl font-bold text-white">Alertas de Venta por Telegram</h3>
                <p className="mt-2 text-slate-400">"Acabas de vender $97 gracias al Anuncio X". Recibe notificaciones instantáneas con los UTMs para saber qué funciona, mientras funciona.</p>
              </div>
              <div className="card p-6 rounded-xl border-t-4 border-violet-500">
                <h3 className="text-xl font-bold text-white flex items-center justify-between">
                  <span>Control Total de Anuncios</span>
                  <span className="text-xs bg-violet-500 text-white font-bold py-1 px-3 rounded-full">PRÓXIMAMENTE</span>
                </h3>
                <p className="mt-2 text-slate-400">¿Un anuncio está perdiendo dinero? Páusalo desde nuestro dashboard con un clic. ¿Uno está ganando? Déjalo correr. El poder de actuar sobre los datos, sin salir de la plataforma.</p>
              </div>
              <div className="card p-6 rounded-xl border-t-4 border-green-500">
                <h3 className="text-xl font-bold text-white">Análisis de Cohortes</h3>
                <p className="mt-2 text-slate-400">Descubre el Valor de Vida del Cliente (LTV) por campaña. ¿Qué anuncio atrae a los clientes que más gastan a largo plazo? Ahora lo sabrás.</p>
              </div>
            </div>
          </div>
        </section>
        
        {/* Permissions Section */}
        <section className="py-20 md:py-28">
          <div className="container mx-auto px-6">
            <div className="text-center max-w-3xl mx-auto">
              <h2 className="text-3xl md:text-5xl font-bold text-white">Nuestra Promesa: <span className="gradient-text">Transparencia Radical</span></h2>
              <p className="mt-4 text-lg text-slate-400">Para darte este poder, necesitamos tu permiso. Te explicamos para qué es cada uno, en lenguaje claro y simple.</p>
            </div>
            <div className="mt-16 max-w-4xl mx-auto grid md:grid-cols-2 gap-8">
              <div className="card p-8 rounded-xl">
                <h3 className="text-xl font-bold text-white">Permiso para VER tus Resultados</h3>
                <p className="mt-4 text-slate-400">Para mostrarte el panorama completo, necesitamos conectar los puntos. Este permiso nos deja <strong className="text-white">ver cuánto gastas en cada anuncio.</strong></p>
                <p className="mt-2 text-slate-400">Es la única forma de cruzar ese gasto con tus ventas de Hotmart y darte tu ROAS real. Es un permiso de <strong className="text-white">solo lectura:</strong> solo miramos, no tocamos.
                <span className="block mt-4 text-xs text-slate-500">Para el analista: Solicitamos el permiso <code className="text-violet-400">ads_read</code>.</span>
                </p>
              </div>
              <div className="card p-8 rounded-xl">
                <h3 className="text-xl font-bold text-white">Permiso para GESTIONAR tus Anuncios</h3>
                <p className="mt-4 text-slate-400">Aquí es donde tomas el control. Este permiso te permitirá <strong className="text-white">pausar las campañas perdedoras con un clic,</strong> directamente desde HotAPI.</p>
                <p className="mt-2 text-slate-400">Es la diferencia entre analizar y optimizar en tiempo real, dándote una ventaja decisiva.
                <span className="block mt-4 text-xs text-slate-500">Para el analista: Solicitamos el permiso <code className="text-violet-400">ads_management</code>.</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="py-20 md:py-28 bg-black">
          <div className="container mx-auto px-6">
            <div className="text-center max-w-3xl mx-auto">
              <h2 className="text-3xl md:text-5xl font-bold text-white">Preguntas que Probablemente Tienes</h2>
            </div>
            <div className="mt-16 max-w-3xl mx-auto space-y-6">
              <div className="card rounded-lg p-6">
                <h3 className="font-bold text-lg text-white">¿Es seguro conectar mis cuentas?</h3>
                <p className="mt-2 text-slate-400">Absolutamente. Usamos los protocolos de autenticación OAuth y las APIs oficiales de Meta y Hotmart. Nunca vemos tus contraseñas. Solo obtenemos los permisos que tú apruebas explícitamente.</p>
              </div>
              <div className="card rounded-lg p-6">
                <h3 className="font-bold text-lg text-white">¿Tardaré mucho en configurarlo?</h3>
                <p className="mt-2 text-slate-400">Menos de 5 minutos. Son literalmente un par de clics para autorizar cada plataforma. Nuestro sistema hace el resto. No hay que instalar códigos ni scripts.</p>
              </div>
              <div className="card rounded-lg p-6">
                <h3 className="font-bold text-lg text-white">¿Quién debería usar HotAPI?</h3>
                <p className="mt-2 text-slate-400">Infoproductores, coaches, creadores de cursos y agencias que venden productos a través de Hotmart y usan Meta Ads (Facebook/Instagram) para generar ventas. Si inviertes más de $1,000 al mes en anuncios, necesitas esto.</p>
              </div>
              <div className="card rounded-lg p-6">
                <h3 className="font-bold text-lg text-white">¿Y si no me gusta o no me funciona?</h3>
                <p className="mt-2 text-slate-400">Aunque la configuración inicial es gratuita para que veas el valor, todos nuestros planes de pago vienen con una garantía. Si la plataforma no te ahorra (o te ayuda a ganar) más dinero de lo que cuesta, no queremos tu dinero.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-24 md:py-32 section-glow">
          <div className="container mx-auto px-6 text-center">
            <h2 className="text-4xl md:text-6xl font-extrabold text-white">La Decisión es Simple.</h2>
            <p className="mt-6 max-w-3xl mx-auto text-lg md:text-xl text-slate-400">
              Tienes dos opciones. Opción 1: Seguir como hasta ahora, navegando a ciegas, quemando dinero en la oscuridad y esperando tener suerte. Opción 2: Encender la luz, tomar el control y escalar tu negocio basado en la verdad.
            </p>
            <div className="mt-10">
              <Link to="/login" className="cta-button text-white font-bold text-xl px-10 py-5 rounded-full inline-block">
                Quiero el Control. Empezar Ahora.
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-black border-t border-slate-800">
        <div className="container mx-auto px-6 py-8 text-center text-slate-500">
          <p>&copy; 2024 HotAPI. Todos los derechos reservados. Deja de adivinar, empieza a escalar.</p>
        </div>
      </footer>

    </div>
  );
}