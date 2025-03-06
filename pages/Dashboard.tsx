// ... (previous imports)

export default function Dashboard() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [user]);

  async function loadData() {
    try {
      setLoading(true);
      
      if (!user) return;

      // Load user's products or all products for admin
      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      const query = supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      // If not admin, filter by user_id
      if (userData?.role !== 'admin') {
        query.eq('user_id', user.id);
      }

      const { data: productsData, error: productsError } = await query;

      if (productsError) throw productsError;
      setProducts(productsData || []);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }

  // ... (rest of the component remains the same)
}