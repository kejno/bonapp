import type { CSSProperties, Dispatch, FormEvent, SetStateAction } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/axios';
import { AvailabilityToggle } from '../components/AvailabilityToggle';

interface MenuCategory {
  id: string;
  name: string;
  sortOrder: number;
  isVisible: boolean;
}

interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description?: string;
  price: number;
  isAvailable: boolean;
  imageUrl?: string;
}

interface CategoryFormState {
  name: string;
  isVisible: boolean;
}

interface ItemFormState {
  name: string;
  description: string;
  price: string;
  imageUrl: string;
  categoryId: string;
  isAvailable: boolean;
}

const EMPTY_CATEGORY_FORM: CategoryFormState = { name: '', isVisible: true };

function getItemSuffix(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'ий';
  if (mod10 === 1) return 'ию';
  if (mod10 >= 2 && mod10 <= 4) return 'ии';
  return 'ий';
}

function emptyItemForm(categoryId: string): ItemFormState {
  return { name: '', description: '', price: '', imageUrl: '', categoryId, isAvailable: true };
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 0',
  borderBottom: '1px solid #f0f0f0',
};

const fieldStyle: CSSProperties = { marginBottom: 8 };

const panelStyle: CSSProperties = {
  marginBottom: 8,
  border: '1px solid #e5e4e7',
  borderRadius: 4,
};

interface ItemFormProps {
  form: ItemFormState;
  setForm: Dispatch<SetStateAction<ItemFormState>>;
  categories: MenuCategory[];
  isEditing: boolean;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
}

function ItemForm({ form, setForm, categories, isEditing, onSubmit, onCancel }: ItemFormProps) {
  return (
    <form onSubmit={onSubmit} style={{ padding: '8px 0' }}>
      <strong>{isEditing ? 'Редактировать позицию' : 'Новая позиция'}</strong>
      <div style={fieldStyle}>
        <label>
          Название
          <br />
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            required
          />
        </label>
      </div>
      <div style={fieldStyle}>
        <label>
          Описание
          <br />
          <input
            type="text"
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          />
        </label>
      </div>
      <div style={fieldStyle}>
        <label>
          Цена
          <br />
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.price}
            onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
            required
          />
        </label>
      </div>
      <div style={fieldStyle}>
        <label>
          URL изображения
          <br />
          <input
            type="text"
            value={form.imageUrl}
            onChange={(e) => setForm((p) => ({ ...p, imageUrl: e.target.value }))}
          />
        </label>
      </div>
      <div style={fieldStyle}>
        <label>
          Категория
          <br />
          <select
            value={form.categoryId}
            onChange={(e) => setForm((p) => ({ ...p, categoryId: e.target.value }))}
            required
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div style={fieldStyle}>
        <label>
          <input
            type="checkbox"
            checked={form.isAvailable}
            onChange={(e) => setForm((p) => ({ ...p, isAvailable: e.target.checked }))}
          />{' '}
          Доступно
        </label>
      </div>
      <button type="submit">Сохранить</button>{' '}
      <button type="button" onClick={onCancel}>
        Отмена
      </button>
    </form>
  );
}

export function MenuPage() {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [itemsByCategory, setItemsByCategory] = useState<Record<string, MenuItem[]>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pageError, setPageError] = useState('');
  const [actionError, setActionError] = useState('');

  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(EMPTY_CATEGORY_FORM);

  const [itemFormCategoryId, setItemFormCategoryId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [itemForm, setItemForm] = useState<ItemFormState>(emptyItemForm(''));

  const loadCategories = useCallback(async () => {
    try {
      const { data } = await api.get<MenuCategory[]>('/menu/categories');
      setCategories(data);
    } catch {
      setPageError('Не удалось загрузить категории');
    }
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  async function loadItems(categoryId: string): Promise<MenuItem[]> {
    try {
      const { data } = await api.get<MenuItem[]>(`/menu/items?categoryId=${categoryId}`);
      setItemsByCategory((prev) => ({ ...prev, [categoryId]: data }));
      return data;
    } catch {
      setActionError('Не удалось загрузить позиции');
      return [];
    }
  }

  function toggleAccordion(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      if (!itemsByCategory[id]) {
        void loadItems(id);
      }
    }
  }

  function openNewCategoryForm() {
    setEditingCategory(null);
    setCategoryForm(EMPTY_CATEGORY_FORM);
    setCategoryFormOpen(true);
    setActionError('');
  }

  function openEditCategoryForm(cat: MenuCategory) {
    setEditingCategory(cat);
    setCategoryForm({ name: cat.name, isVisible: cat.isVisible });
    setCategoryFormOpen(true);
    setActionError('');
  }

  async function handleSaveCategory(e: FormEvent) {
    e.preventDefault();
    setActionError('');
    try {
      if (editingCategory) {
        await api.patch(`/menu/categories/${editingCategory.id}`, categoryForm);
      } else {
        await api.post('/menu/categories', categoryForm);
      }
      setCategoryFormOpen(false);
      await loadCategories();
    } catch {
      setActionError('Не удалось сохранить категорию');
    }
  }

  async function handleDeleteCategory(cat: MenuCategory) {
    const cached = itemsByCategory[cat.id];
    const items = cached !== undefined ? cached : await loadItems(cat.id);
    if (items.length > 0) {
      const suffix = getItemSuffix(items.length);
      const confirmed = window.confirm(
        `Категория содержит ${items.length} позиц${suffix}. Удалить категорию вместе с позициями?`,
      );
      if (!confirmed) return;
    }
    setActionError('');
    try {
      await api.delete(`/menu/categories/${cat.id}`);
      if (expandedId === cat.id) setExpandedId(null);
      setItemsByCategory((prev) => {
        const next = { ...prev };
        delete next[cat.id];
        return next;
      });
      await loadCategories();
    } catch {
      setActionError('Не удалось удалить категорию');
    }
  }

  function openNewItemForm(categoryId: string) {
    setEditingItem(null);
    setItemForm(emptyItemForm(categoryId));
    setItemFormCategoryId(categoryId);
    setActionError('');
  }

  function openEditItemForm(item: MenuItem) {
    setEditingItem(item);
    setItemForm({
      name: item.name,
      description: item.description ?? '',
      price: item.price.toFixed(2),
      imageUrl: item.imageUrl ?? '',
      categoryId: item.categoryId,
      isAvailable: item.isAvailable,
    });
    setItemFormCategoryId(item.categoryId);
    setActionError('');
  }

  async function handleSaveItem(e: FormEvent) {
    e.preventDefault();
    if (!itemFormCategoryId) return;
    setActionError('');
    try {
      const originalCategoryId = editingItem?.categoryId;
      const newCategoryId = itemForm.categoryId;
      const payload = {
        name: itemForm.name,
        description: itemForm.description,
        price: parseFloat(itemForm.price),
        imageUrl: itemForm.imageUrl,
        categoryId: newCategoryId,
        isAvailable: itemForm.isAvailable,
      };
      if (editingItem) {
        await api.patch(`/menu/items/${editingItem.id}`, payload);
      } else {
        await api.post('/menu/items', payload);
      }
      setItemFormCategoryId(null);
      setEditingItem(null);
      await loadItems(newCategoryId);
      if (originalCategoryId && originalCategoryId !== newCategoryId) {
        await loadItems(originalCategoryId);
      }
    } catch {
      setActionError('Не удалось сохранить позицию');
    }
  }

  async function handleDeleteItem(item: MenuItem) {
    if (!window.confirm(`Удалить позицию «${item.name}»?`)) return;
    setActionError('');
    try {
      await api.delete(`/menu/items/${item.id}`);
      await loadItems(item.categoryId);
    } catch {
      setActionError('Не удалось удалить позицию');
    }
  }

  async function handleToggleAvailability(itemId: string) {
    const categoryId = Object.keys(itemsByCategory).find((cid) =>
      itemsByCategory[cid].some((it) => it.id === itemId),
    );
    if (!categoryId) return;
    const item = itemsByCategory[categoryId].find((it) => it.id === itemId);
    if (!item) return;
    setActionError('');
    try {
      await api.patch(`/menu/items/${itemId}`, { isAvailable: !item.isAvailable });
      await loadItems(categoryId);
    } catch {
      setActionError('Не удалось изменить доступность');
    }
  }

  return (
    <div>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}
      >
        <h2 style={{ margin: 0 }}>Меню</h2>
        <button type="button" onClick={openNewCategoryForm}>
          Добавить категорию
        </button>
      </div>

      {pageError && <p style={{ color: 'red' }}>{pageError}</p>}
      {actionError && <p style={{ color: 'red' }}>{actionError}</p>}

      {categoryFormOpen && (
        <form
          onSubmit={handleSaveCategory}
          style={{ marginBottom: 16, padding: 12, border: '1px solid #e5e4e7', borderRadius: 4 }}
        >
          <strong>
            {editingCategory ? 'Редактировать категорию' : 'Новая категория'}
          </strong>
          <div style={fieldStyle}>
            <label>
              Название
              <br />
              <input
                type="text"
                value={categoryForm.name}
                onChange={(e) => setCategoryForm((p) => ({ ...p, name: e.target.value }))}
                required
              />
            </label>
          </div>
          <div style={fieldStyle}>
            <label>
              <input
                type="checkbox"
                checked={categoryForm.isVisible}
                onChange={(e) => setCategoryForm((p) => ({ ...p, isVisible: e.target.checked }))}
              />{' '}
              Видима в меню
            </label>
          </div>
          <button type="submit">Сохранить</button>{' '}
          <button type="button" onClick={() => setCategoryFormOpen(false)}>
            Отмена
          </button>
        </form>
      )}

      {categories.length === 0 && !pageError && <p>Категорий пока нет.</p>}

      {categories.map((cat) => (
        <div key={cat.id} style={panelStyle}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', gap: 8 }}>
            <button
              type="button"
              onClick={() => toggleAccordion(cat.id)}
              style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
            >
              {expandedId === cat.id ? '▼' : '▶'} {cat.name}
              {!cat.isVisible && ' (скрыта)'}
            </button>
            <button type="button" onClick={() => openEditCategoryForm(cat)}>
              Ред.
            </button>
            <button type="button" onClick={() => handleDeleteCategory(cat)}>
              Удалить
            </button>
          </div>

          {expandedId === cat.id && (
            <div style={{ padding: '0 12px 12px' }}>
              {(itemsByCategory[cat.id] ?? []).map((item) =>
                itemFormCategoryId === cat.id && editingItem?.id === item.id ? (
                  <ItemForm
                    key={item.id}
                    form={itemForm}
                    setForm={setItemForm}
                    categories={categories}
                    isEditing={true}
                    onSubmit={handleSaveItem}
                    onCancel={() => { setItemFormCategoryId(null); setEditingItem(null); }}
                  />
                ) : (
                  <div key={item.id} style={rowStyle}>
                    <span style={{ flex: 1 }}>{item.name}</span>
                    <span>{item.price.toFixed(2)} ₽</span>
                    <AvailabilityToggle
                      itemId={item.id}
                      isAvailable={item.isAvailable}
                      onToggle={handleToggleAvailability}
                    />
                    <button type="button" onClick={() => openEditItemForm(item)}>
                      Ред.
                    </button>
                    <button type="button" onClick={() => handleDeleteItem(item)}>
                      Удалить
                    </button>
                  </div>
                ),
              )}

              {itemFormCategoryId === cat.id && !editingItem ? (
                <ItemForm
                  form={itemForm}
                  setForm={setItemForm}
                  categories={categories}
                  isEditing={false}
                  onSubmit={handleSaveItem}
                  onCancel={() => setItemFormCategoryId(null)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => openNewItemForm(cat.id)}
                  style={{ marginTop: 8 }}
                >
                  Добавить позицию
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
