import {
  Boxes,
  Coins,
  FileText,
  LayoutDashboard,
  type LucideIcon,
  MessageSquareText,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Tags,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import type { Route } from 'next';

export type NavItem = {
  href: Route;
  label: string;
  Icon: LucideIcon;
  /** Shown in the command palette so an action can be found by intent rather
   *  than by the label someone happens to remember. */
  keywords?: string[];
};

export type NavGroup = { label: string; items: NavItem[] };

/**
 * Navigation, grouped by the shape of the work rather than by table.
 *
 * The order follows the operating cycle: see where you stand, decide what to
 * stock, buy it, sell it, then account for it. Someone learning the business
 * can read the sidebar top to bottom and understand how it runs.
 */
export const NAVIGATION: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      {
        href: '/dashboard',
        label: 'Overview',
        Icon: LayoutDashboard,
        keywords: ['dashboard', 'home', 'kpi', 'summary'],
      },
    ],
  },
  {
    label: 'Catalog',
    items: [
      {
        href: '/products',
        label: 'Products',
        Icon: Package,
        keywords: ['sku', 'variant', 'item', 'price', 'images'],
      },
      {
        href: '/bundles' as Route,
        label: 'Bundles',
        Icon: Package,
        keywords: ['kits', 'packages', 'components', 'margin'],
      },
      { href: '/categories', label: 'Categories', Icon: Tags },
      {
        href: '/suppliers',
        label: 'Suppliers',
        Icon: Truck,
        keywords: ['amazon', 'aliexpress'],
      },
    ],
  },
  {
    label: 'Operations',
    items: [
      {
        href: '/purchase-orders',
        label: 'Purchase orders',
        Icon: ShoppingCart,
        keywords: ['po', 'buying', 'receive', 'landed cost', 'freight', 'shipping'],
      },
      {
        href: '/reorder' as Route,
        label: 'Reorder advice',
        Icon: ShoppingCart,
        keywords: ['forecast', 'recommendations', 'budget', 'restock'],
      },
      {
        href: '/inventory',
        label: 'Inventory',
        Icon: Boxes,
        keywords: ['stock', 'on hand', 'movements', 'low stock', 'valuation'],
      },
      {
        href: '/sales',
        label: 'Sales',
        Icon: Receipt,
        keywords: ['orders', 'revenue', 'invoice', 'margin'],
      },
      { href: '/customers', label: 'Customers', Icon: Users, keywords: ['clients', 'buyers'] },
      {
        href: '/quotes',
        label: 'Requests',
        Icon: MessageSquareText,
        keywords: ['quote', 'enquiry', 'inquiry', 'storefront', 'leads'],
      },
    ],
  },
  {
    label: 'Finance',
    items: [
      {
        href: '/ledger',
        label: 'Cash ledger',
        Icon: Wallet,
        keywords: ['balance', 'cash', 'money in', 'money out', 'bank'],
      },
      {
        href: '/expenses',
        label: 'Expenses',
        Icon: Coins,
        keywords: ['costs', 'marketing', 'tools', 'overheads'],
      },
      {
        href: '/owners',
        label: 'Owners',
        Icon: Users,
        keywords: ['equity', 'capital', 'contribution', 'split', 'leonardo', 'youri'],
      },
      {
        href: '/reports',
        label: 'Reports',
        Icon: FileText,
        keywords: ['profit and loss', 'p&l', 'margin by product', 'fx exposure'],
      },
    ],
  },
  {
    label: 'System',
    items: [
      {
        href: '/settings',
        label: 'Settings',
        Icon: Settings,
        keywords: ['exchange rate', 'team', 'members', 'currency', 'storage'],
      },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAVIGATION.flatMap((group) => group.items);

/** Longest-prefix match, so /products/abc keeps Products lit without /
 *  matching everything. */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
