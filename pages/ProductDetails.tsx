// ... (previous imports)
import { validateProductAccess } from '../lib/auth';

export default function ProductDetails() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // ... (other state variables)

  useEffect(() => {
    loadProduct();
  }, [id]);

  async function loadProduct() {
    if (!id || !user) return;

    try {
      // First check access
      const hasAccess = await validateProductAccess(user.id, id);
      if (!hasAccess) {
        setError('No tienes acceso a este producto');
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      setProduct(data);
      setFbPixelId(data.fb_pixel_id || '');
      setFbAccessToken(data.fb_access_token || '');
      setFbTestEventCode(data.fb_test_event_code || '');
    } catch (err) {
      console.error('Error loading product:', err);
      setError('Error cargando el producto');
    } finally {
      setLoading(false);
    }
  }

  // ... (rest of the component remains the same)
}