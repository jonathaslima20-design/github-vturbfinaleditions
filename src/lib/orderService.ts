import { supabase } from '@/lib/supabase';
import type { Order, OrderItem, OrderStatus } from '@/types';
import { deductStockForOrder } from '@/lib/stockUtils';

interface CreateOrderData {
  store_owner_id: string;
  customer_name: string;
  customer_whatsapp: string;
  customer_country_code: string;
  order_type: 'whatsapp' | 'ecommerce';
  subtotal: number;
  total: number;
  notes?: string;
  whatsapp_message?: string;
  source: 'cart' | 'product_page';
  coupon_id?: string | null;
  coupon_code?: string | null;
  discount_amount?: number;
  payment_method?: string | null;
  payment_method_discount?: number;
  delivery_fee?: number;
  delivery_option?: string | null;
}

interface CreateOrderItemData {
  product_id: string;
  product_title: string;
  product_image_url?: string;
  quantity: number;
  unit_price: number;
  selected_color?: string | null;
  selected_size?: string | null;
  selected_flavor?: string | null;
  selected_variant_label?: string | null;
  item_notes?: string;
  subtotal: number;
}

interface AutoDeductConfig {
  enabled: boolean;
  storeOwnerId: string;
}

export async function createOrder(
  orderData: CreateOrderData,
  items: CreateOrderItemData[],
  autoDeduct?: AutoDeductConfig
): Promise<Order | null> {
  const insertPayload: Record<string, unknown> = {
    store_owner_id: orderData.store_owner_id,
    customer_name: orderData.customer_name,
    customer_whatsapp: orderData.customer_whatsapp,
    customer_country_code: orderData.customer_country_code,
    order_type: orderData.order_type,
    subtotal: orderData.subtotal,
    total: orderData.total,
    notes: orderData.notes || '',
    whatsapp_message: orderData.whatsapp_message || '',
    source: orderData.source,
  };

  if (orderData.coupon_id) {
    insertPayload.coupon_id = orderData.coupon_id;
    insertPayload.coupon_code = orderData.coupon_code;
    insertPayload.discount_amount = orderData.discount_amount || 0;
  }

  if (orderData.payment_method) {
    insertPayload.payment_method = orderData.payment_method;
    insertPayload.payment_method_discount = orderData.payment_method_discount || 0;
  }

  if (orderData.delivery_option) {
    insertPayload.delivery_option = orderData.delivery_option;
    insertPayload.delivery_fee = orderData.delivery_fee || 0;
  }

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert(insertPayload)
    .select()
    .maybeSingle();

  if (orderError || !order) {
    console.error('Error creating order:', orderError);
    return null;
  }

  const orderItems = items.map((item) => ({
    order_id: order.id,
    product_id: item.product_id,
    product_title: item.product_title,
    product_image_url: item.product_image_url || '',
    quantity: item.quantity,
    unit_price: item.unit_price,
    selected_color: item.selected_color || null,
    selected_size: item.selected_size || null,
    selected_flavor: item.selected_flavor || null,
    selected_variant_label: item.selected_variant_label || null,
    item_notes: item.item_notes || '',
    subtotal: item.subtotal,
  }));

  const { error: itemsError } = await supabase
    .from('order_items')
    .insert(orderItems);

  if (itemsError) {
    console.error('Error creating order items:', itemsError);
  }

  if (autoDeduct?.enabled) {
    const deductionItems = items.map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
      selected_color: item.selected_color,
      selected_size: item.selected_size,
      selected_flavor: item.selected_flavor,
      selected_variant_label: item.selected_variant_label,
    }));
    await deductStockForOrder(order.id, autoDeduct.storeOwnerId, deductionItems);
  }

  if (orderData.coupon_id && orderData.discount_amount) {
    try {
      await supabase.rpc('apply_coupon_usage', {
        p_coupon_id: orderData.coupon_id,
        p_order_id: order.id,
        p_customer_whatsapp: orderData.customer_whatsapp,
        p_discount_applied: orderData.discount_amount,
        p_order_type: orderData.order_type,
      });
    } catch (err) {
      console.error('Error applying coupon usage:', err);
    }
  }

  return order as Order;
}

interface FetchOrdersFilters {
  status?: OrderStatus;
  search?: string;
}

export async function fetchOrders(
  storeOwnerId: string,
  limit = 20,
  offset = 0,
  filters?: FetchOrdersFilters
): Promise<{ data: Order[]; count: number }> {
  let query = supabase
    .from('orders')
    .select('*, order_items(*)', { count: 'exact' })
    .eq('store_owner_id', storeOwnerId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  if (filters?.search) {
    query = query.ilike('customer_name', `%${filters.search}%`);
  }

  const { data, count, error } = await query;

  if (error) {
    console.error('Error fetching orders:', error);
    return { data: [], count: 0 };
  }

  return { data: (data || []) as Order[], count: count || 0 };
}

export async function fetchOrderById(orderId: string): Promise<Order | null> {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', orderId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching order:', error);
    return null;
  }

  return data as Order | null;
}

export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus
): Promise<boolean> {
  const { error } = await supabase
    .from('orders')
    .update({ status: newStatus })
    .eq('id', orderId);

  if (error) {
    console.error('Error updating order status:', error);
    return false;
  }

  return true;
}

interface OrderStats {
  total: number;
  pending: number;
  confirmed: number;
  preparing: number;
  shipped: number;
  delivered: number;
  cancelled: number;
  totalRevenue: number;
}

export async function getOrderStats(storeOwnerId: string): Promise<OrderStats> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data, error } = await supabase
    .from('orders')
    .select('status, total')
    .eq('store_owner_id', storeOwnerId)
    .gte('created_at', thirtyDaysAgo.toISOString());

  if (error || !data) {
    console.error('Error fetching order stats:', error);
    return { total: 0, pending: 0, confirmed: 0, preparing: 0, shipped: 0, delivered: 0, cancelled: 0, totalRevenue: 0 };
  }

  const stats: OrderStats = {
    total: data.length,
    pending: 0,
    confirmed: 0,
    preparing: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
    totalRevenue: 0,
  };

  for (const order of data) {
    const status = order.status as OrderStatus;
    if (status in stats) {
      stats[status as keyof Omit<OrderStats, 'total' | 'totalRevenue'>]++;
    }
    if (status !== 'cancelled') {
      stats.totalRevenue += Number(order.total) || 0;
    }
  }

  return stats;
}

export async function getPendingOrderCount(storeOwnerId: string): Promise<number> {
  const { count, error } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('store_owner_id', storeOwnerId)
    .eq('status', 'pending');

  if (error) {
    console.error('Error fetching pending order count:', error);
    return 0;
  }

  return count || 0;
}

export interface OrderInventoryItem {
  product_id: string;
  product_title: string;
  quantity: number;
  current_stock: number | null;
  track_inventory: boolean;
  selected_color?: string | null;
  selected_size?: string | null;
  selected_flavor?: string | null;
  selected_variant_label?: string | null;
}

export async function fetchOrderInventoryInfo(
  orderId: string
): Promise<OrderInventoryItem[]> {
  const { data: items, error } = await supabase
    .from('order_items')
    .select('product_id, product_title, quantity, selected_color, selected_size, selected_flavor, selected_variant_label')
    .eq('order_id', orderId);

  if (error || !items) return [];

  const productIds = [...new Set(items.map((i) => i.product_id))];
  const { data: products } = await supabase
    .from('products')
    .select('id, track_inventory, stock_quantity')
    .in('id', productIds);

  const productMap = new Map(
    (products || []).map((p) => [p.id, p])
  );

  return items.map((item) => {
    const product = productMap.get(item.product_id);
    return {
      product_id: item.product_id,
      product_title: item.product_title,
      quantity: item.quantity,
      current_stock: product?.stock_quantity ?? null,
      track_inventory: product?.track_inventory ?? false,
      selected_color: item.selected_color,
      selected_size: item.selected_size,
      selected_flavor: item.selected_flavor,
      selected_variant_label: item.selected_variant_label,
    };
  });
}
