import { Link } from 'react-router-dom';

// --- Iconos SVG para mayor impacto visual y rendimiento ---
const CheckCircleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const WarningIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-red-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
);

const RocketIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mr-3 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
);


export default function LandingPage() {
  // --- Componente reutilizable para las tarjetas de características ---
  const FeatureCard = ({ title, children, icon }: { title: string; children: React.ReactNode; icon: React.ReactNode }) => (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 transform hover:-translate-y-1 transition-transform duration-300">
      <div className="flex items-center mb-3">
        {icon}
        <h3 className="text-xl font-bold text-white">{title}</h3>
      </div>
      <p className="text-slate-400">{children}</p>
    </div>
  );

  return (
    <div className="antialiased font-sans bg-[#0A0A0A] text-slate-300">
      {/* --- Header --- */}
      <header className="bg-black/60 backdrop-blur-lg sticky top-0 z-50 border-b border-slate-800">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-white">Hot<span className="text-violet-500">API</span></h2>
          <nav className="hidden md:flex items-center space-x-8">
            <a href="#the-lie" className="text-slate-400 hover:text-white transition-colors duration-200">La Mentira</a>
            <a href="#the-weapon" className="text-slate-400 hover:text-white transition-colors duration-200">El Arma</a>
            <a href="#the-proof" className="text-slate-400 hover:text-white transition-colors duration-200">La Prueba</a>
          </nav>
          <Link to="/login" className="bg-violet-600 hover:bg-violet-500 text-white font-semibold px-5 py-2 rounded-lg transition-all duration-300 shadow-[0_0_15px_rgba(139,92,246,0.5)] hover:shadow-[0_0_25px_rgba(139,92,246,0.8)]">
            Iniciar Sesión
          </Link>
        </div>
      </header>

      <main>
        {/* --- Hero Section --- */}
        <section className="relative py-24 md:py-40 text-center overflow-hidden">
          {/* Efecto de brillo de fondo */}
          <div className="absolute inset-0 -top-24 w-full h-full bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(124,58,237,0.3),rgba(255,255,255,0))] -z-0"></div>
          <div className="container mx-auto px-6 relative z-10">
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold text-white leading-tight tracking-tighter">
              Deja de Quemar Dinero en Meta Ads.
              <br />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-pink-500">Es Hora de Imprimirlo.</span>
            </h1>
            <p className="mt-6 max-w-3xl mx-auto text-lg md:text-xl text-slate-400">
              El Ads Manager te miente. Tus hojas de cálculo son un chiste. Mientras tú "optimizas" a ciegas, tus competidores usan datos reales para robarte a tus clientes. <strong className="text-white">Nosotros lo arreglamos.</strong>
            </p>
            <div className="mt-10">
              <a href="#cta" className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-lg px-8 py-4 rounded-full inline-block transition-all duration-300 transform hover:scale-105 shadow-[0_5px_30px_rgba(109,40,217,0.4)]">
                Activar Mi Ventaja Injusta
              </a>
              <p className="mt-4 text-sm text-slate-500">Instalación en 1 clic. Resultados en 24 horas. Garantizado.</p>
            </div>
          </div>
        </section>

        {/* --- La Mentira (Pain Section) --- */}
        <section id="the-lie" className="py-20 md:py-28 bg-black">
          <div className="container mx-auto px-6">
            <div className="text-center max-w-3xl mx-auto">
                <WarningIcon />
                <h2 className="mt-4 text-3xl md:text-5xl font-bold text-white">El Juego Está Arreglado en tu Contra</h2>
                <p className="mt-4 text-lg text-slate-400">Si vendes en Hotmart y usas Meta Ads, te están mintiendo en la cara. Y te está costando una fortuna.</p>
            </div>
            <div className="mt-16 max-w-4xl mx-auto grid md:grid-cols-2 gap-8 text-lg text-slate-300">
                <div>
                    <h3 className="text-2xl font-bold text-white mb-4 border-l-4 border-red-500 pl-4">Tu Realidad Actual:</h3>
                    <p className="mb-4">Inviertes miles en Meta. El Ads Manager muestra 15 "compras". Sonríes.</p>
                    <p className="mb-4">Abres Hotmart. Hay 3 ventas reales. Tu sonrisa desaparece.</p>
                    <p className="mb-4">Empieza la pesadilla: ¿Qué anuncio funciona? ¿Qué UTM es correcto? Abres una hoja de cálculo, exportas datos, pierdes horas... y para cuando tienes una respuesta (incorrecta), <strong className="text-white">ya has quemado otros $1,000 en el anuncio equivocado.</strong></p>
                </div>
                <div>
                    <h3 className="text-2xl font-bold text-white mb-4 border-l-4 border-red-500 pl-4">La Causa del Desastre:</h3>
                    <p className="mb-4"><strong className="text-white">1. El Píxel Miente:</strong> Desde iOS14, el píxel de Facebook es un optimista delirante. Inventa ventas que no existen.</p>
                    <p className="mb-4"><strong className="text-white">2. Datos Retrasados:</strong> Decidir basándote en datos de ayer es como conducir mirando por el retrovisor. Te vas a estrellar.</p>
                    <p className="mb-4"><strong className="text-white">3. Atribución Ciega:</strong> No sabes qué anuncio generó esa venta con Order Bump. Estás dejando el 50% de tus ganancias sobre la mesa.</p>
                </div>
            </div>
             <p className="text-center text-xl font-semibold text-white mt-16 bg-red-900/30 border border-red-500/50 max-w-4xl mx-auto p-6 rounded-lg">La falta de datos perfectos y en tiempo real no es un problema. Es un <span className="text-red-400">ladrón silencioso</span> que vacía tu cuenta bancaria mientras duermes.</p>
          </div>
        </section>

        {/* --- El Arma (Solution Section) --- */}
        <section id="the-weapon" className="py-20 md:py-28 relative overflow-hidden">
            <div className="absolute inset-0 w-full h-full bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(124,58,237,0.2),rgba(255,255,255,0))] -z-0"></div>
            <div className="container mx-auto px-6 relative z-10">
                <div className="text-center max-w-3xl mx-auto">
                    <h2 className="text-3xl md:text-5xl font-bold text-white">HotAPI: Tu <span className="bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-cyan-400">Arma de Dominación</span></h2>
                    <p className="mt-4 text-lg text-slate-400">No somos "otro dashboard". Somos el puente directo entre tu dinero (Hotmart) y tu tráfico (Meta). <strong className="text-white">Convertimos tus datos de ventas en un ejército de IA que trabaja para ti 24/7.</strong></p>
                </div>

                <div className="mt-16 max-w-5xl mx-auto">
                    <div className="grid md:grid-cols-2 gap-8 items-center">
                        <div className="space-y-6">
                            <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-xl">
                                <h3 className="text-2xl font-bold text-white">Paso 1: Conexión en 1 Clic</h3>
                                <p className="mt-2 text-slate-400">Usa <strong className="text-white">Facebook Login</strong>. Con un clic, conectas de forma segura todas tus cuentas publicitarias. No vemos tu contraseña, solo los permisos que nos das. Luego, pega tu API de Hotmart. <strong className="text-white">Tiempo total: 90 segundos.</strong></p>
                            </div>
                            <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-xl">
                                <h3 className="text-2xl font-bold text-white">Paso 2: La Magia de la API</h3>
                                <p className="mt-2 text-slate-400">Aquí es donde aniquilamos a tu competencia. Ignoramos el Píxel roto y usamos la <strong className="text-violet-400">API de Conversiones de Meta</strong>. Enviamos tus datos de ventas REALES de Hotmart (incluyendo Order Bumps y Upsells) directamente al cerebro de Meta.</p>
                            </div>
                        </div>
                        <div className="bg-green-900/30 border border-green-500/50 p-8 rounded-xl text-center">
                             <h3 className="text-3xl font-bold text-white">Paso 3: Activa el Modo Bestia</h3>
                             <p className="mt-4 text-slate-300 text-lg">Nuestra IA usa la <strong className="text-violet-400">API de Marketing de Meta</strong> para tomar el control. Analiza los datos perfectos que le enviamos y automáticamente:</p>
                             <ul className="mt-4 space-y-2 text-left">
                                <li className="flex items-start"><CheckCircleIcon /><span className="ml-2">Mata campañas perdedoras antes de que quemen tu dinero.</span></li>
                                <li className="flex items-start"><CheckCircleIcon /><span className="ml-2">Redistribuye tu presupuesto a los anuncios ganadores en tiempo real.</span></li>
                                <li className="flex items-start"><CheckCircleIcon /><span className="ml-2">Escala vertical y horizontalmente mientras duermes.</span></li>
                             </ul>
                             <p className="mt-6 font-bold text-white text-xl">Tú pones las reglas. La IA ejecuta. Tú ganas.</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        {/* --- La Prueba (Features/Benefits Section) --- */}
        <section id="the-proof" className="py-20 md:py-28 bg-black">
          <div className="container mx-auto px-6">
            <div className="text-center max-w-3xl mx-auto">
              <h2 className="text-3xl md:text-5xl font-bold text-white">Esto no es Data. Es <span className="text-green-400">Poder de Fuego.</span></h2>
              <p className="mt-4 text-lg text-slate-400">Cada función está diseñada para una sola cosa: <strong className="text-white">aumentar tu ROAS y aplastar a tu competencia.</strong></p>
            </div>
            <div className="mt-16 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              <FeatureCard title="ROAS Real al Minuto" icon={<RocketIcon />}>
                Tu gasto de Meta y tus ingresos de Hotmart, cara a cara. Sin mentiras. Identifica ganadores y perdedores en segundos.
              </FeatureCard>
              <FeatureCard title="Atribución Perfecta" icon={<RocketIcon />}>
                Conectamos cada venta, cada Order Bump, al anuncio, conjunto y campaña EXACTOS que la generaron. Se acabaron las dudas.
              </FeatureCard>
              <FeatureCard title="Sobrealimenta el Algoritmo" icon={<RocketIcon />}>
                Al enviar datos de compra reales vía Conversions API, entrenamos a la IA de Meta para que encuentre clones exactos de tus mejores clientes. Es un imán de dinero.
              </FeatureCard>
              <FeatureCard title="Control de Tráfico por IA (24/7)" icon={<RocketIcon />}>
                Activa el piloto automático. Nuestra IA gestiona tu presupuesto como un trader de Wall Street. Tú duermes, la IA optimiza, tú despiertas con más ventas.
              </FeatureCard>
              <FeatureCard title="Control Manual o Híbrido" icon={<RocketIcon />}>
                ¿Eres un control freak? Perfecto. Pausa anuncios, ajusta presupuestos desde nuestro dashboard. O deja que la IA haga el trabajo pesado. Tú eliges.
              </FeatureCard>
              <FeatureCard title="Reportes que Generan Dinero" icon={<RocketIcon />}>
                No más parálisis por análisis. Recibe reportes simples que te dicen: "invierte aquí, apaga esto". Decisiones, no datos.
              </FeatureCard>
            </div>
          </div>
        </section>

        {/* --- Final CTA --- */}
        <section id="cta" className="py-24 md:py-32">
          <div className="container mx-auto px-6 text-center max-w-4xl mx-auto">
            <h2 className="text-4xl md:text-6xl font-extrabold text-white">Tienes Dos Opciones.</h2>
            <p className="mt-6 text-lg md:text-xl text-slate-400">
              <strong className="text-white">Opción 1:</strong> Seguir como hasta ahora. Usar hojas de cálculo, adivinar, quemar dinero y preguntarte por qué tu negocio no escala.
            </p>
            <p className="mt-4 text-lg md:text-xl text-slate-400">
              <strong className="text-white">Opción 2:</strong> Activar tu ventaja injusta. Usar datos perfectos y una IA para dominar tus anuncios, aplastar tu ROAS y escalar sin piedad.
            </p>
            <p className="mt-8 text-2xl md:text-3xl font-bold text-white">La elección es tuya. Pero tu competencia ya está decidiendo.</p>
            <div className="mt-10">
              <a href="/login" className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 text-white font-bold text-xl px-12 py-5 rounded-full inline-block transition-all duration-300 transform hover:scale-105 shadow-[0_5px_30px_rgba(74,222,128,0.4)]">
                Quiero Dominar. Activar HotAPI AHORA.
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* --- Footer --- */}
      <footer className="bg-black border-t border-slate-800">
        <div className="container mx-auto px-6 py-8 text-center text-slate-500">
          <p>&copy; 2024 HotAPI. Todos los derechos reservados.</p>
          <p className="mt-2 text-sm">Deja de adivinar. Empieza a dominar.</p>
        </div>
      </footer>
    </div>
  );
}
