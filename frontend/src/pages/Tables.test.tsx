import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '../api/axios';
import { downloadQr, Tables } from './Tables';

vi.mock('../api/axios', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('downloadQr', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as unknown as Node);
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as unknown as Node);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates object URL from blob and triggers download with correct filename', () => {
    const blob = new Blob(['png-data'], { type: 'image/png' });
    const fakeAnchor = { href: '', download: '', click: vi.fn() };
    vi.spyOn(document, 'createElement').mockReturnValueOnce(fakeAnchor as unknown as HTMLElement);

    downloadQr(blob, 'Main Hall');

    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(fakeAnchor.href).toBe('blob:mock-url');
    expect(fakeAnchor.download).toBe('table-Main Hall.png');
    expect(fakeAnchor.click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('revokes URL even when table name is empty string', () => {
    const blob = new Blob(['x']);
    const fakeAnchor = { href: '', download: '', click: vi.fn() };
    vi.spyOn(document, 'createElement').mockReturnValueOnce(fakeAnchor as unknown as HTMLElement);

    downloadQr(blob, '');

    expect(fakeAnchor.download).toBe('table-.png');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('generates distinct filenames for multiple tables', () => {
    (URL.createObjectURL as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce('blob:url-a')
      .mockReturnValueOnce('blob:url-b');

    const anchor1 = { href: '', download: '', click: vi.fn() };
    const anchor2 = { href: '', download: '', click: vi.fn() };
    vi.spyOn(document, 'createElement')
      .mockReturnValueOnce(anchor1 as unknown as HTMLElement)
      .mockReturnValueOnce(anchor2 as unknown as HTMLElement);

    downloadQr(new Blob(['a']), 'Table A');
    downloadQr(new Blob(['b']), 'Table B');

    expect(anchor1.download).toBe('table-Table A.png');
    expect(anchor2.download).toBe('table-Table B.png');
    expect(anchor1.click).toHaveBeenCalledTimes(1);
    expect(anchor2.click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:url-a');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:url-b');
  });
});

describe('Tables component', () => {
  const mockTables = [{ id: 'table-1', name: 'Table A' }];

  beforeEach(() => {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:test-url');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('disables download button and shows loading text while QR request is pending', async () => {
    let resolveQr!: (val: { data: Blob }) => void;
    const qrPromise = new Promise<{ data: Blob }>((res) => {
      resolveQr = res;
    });

    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: mockTables })
      .mockReturnValueOnce(qrPromise);

    render(<Tables />);
    await screen.findByText('Table A');

    await userEvent.click(screen.getByRole('button', { name: 'Скачать QR' }));

    expect(screen.getByRole('button', { name: 'Загрузка...' })).toBeDisabled();

    await act(async () => {
      resolveQr({ data: new Blob(['png']) });
    });

    expect(screen.getByRole('button', { name: 'Скачать QR' })).not.toBeDisabled();
  });

  it('disables delete button while delete request is pending', async () => {
    let resolveDelete!: (val: unknown) => void;
    const deletePromise = new Promise((res) => {
      resolveDelete = res;
    });

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.get).mockResolvedValueOnce({ data: mockTables });
    vi.mocked(api.delete).mockReturnValue(deletePromise as ReturnType<typeof api.delete>);

    render(<Tables />);
    await screen.findByText('Table A');

    const deleteButton = screen.getByRole('button', { name: 'Удалить' });
    await userEvent.click(deleteButton);

    expect(deleteButton).toBeDisabled();

    await act(async () => {
      resolveDelete({ data: {} });
    });

    expect(screen.queryByText('Table A')).not.toBeInTheDocument();
  });

  it('trims whitespace from table name before sending to API', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: [] });
    vi.mocked(api.post).mockResolvedValueOnce({ data: { id: 'new-1', name: 'New Table' } });

    render(<Tables />);
    await screen.findByRole('button', { name: 'Добавить стол' });

    const input = screen.getByRole('textbox');
    await userEvent.type(input, '  New Table  ');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить стол' }));

    expect(api.post).toHaveBeenCalledWith('/tables', { name: 'New Table' });
  });
});
