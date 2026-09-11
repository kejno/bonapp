import { downloadQr } from './Tables';

describe('downloadQr', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    URL.revokeObjectURL = vi.fn();
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
