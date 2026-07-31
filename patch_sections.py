import sys

with open('src/pages/CardsManagement.tsx', 'r') as f:
    content = f.read()

target = """        {
            id: 'add_stock',
            title: 'إضافة كروت',
            subtitle: 'تزويد ورصيد المخزون',
            icon: Plus,
            color: 'bg-indigo-600',
            lightBg: 'bg-indigo-50 dark:bg-indigo-950/60',
            textColor: 'text-indigo-600 dark:text-indigo-400',
            borderColor: 'border-indigo-100 dark:border-indigo-900/50',
            visible: getSecPermission('cards_stock', 'view')
        },"""

replacement = """        {
            id: 'purchases',
            title: 'الموردين والمشتريات',
            subtitle: 'شراء الكروت وحسابات الموردين',
            icon: Truck,
            color: 'bg-indigo-600',
            lightBg: 'bg-indigo-50 dark:bg-indigo-950/60',
            textColor: 'text-indigo-600 dark:text-indigo-400',
            borderColor: 'border-indigo-100 dark:border-indigo-900/50',
            visible: getSecPermission('cards_stock', 'view')
        },"""

content = content.replace(target, replacement)

with open('src/pages/CardsManagement.tsx', 'w') as f:
    f.write(content)
