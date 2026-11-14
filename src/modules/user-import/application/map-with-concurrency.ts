/**
 * Chạy `fn` cho từng phần tử với tối đa `limit` tác vụ song song, giữ nguyên thứ tự kết quả.
 * Một tác vụ lỗi thì dừng nhận việc mới và ném lỗi đó.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = Array.from({ length: items.length }) as R[];
  let next = 0;
  let failure: unknown;
  let failed = false;

  const worker = async (): Promise<void> => {
    while (!failed) {
      const index = next++;
      if (index >= items.length) return;
      try {
        results[index] = await fn(items[index], index);
      } catch (error) {
        failed = true;
        failure = error;
        return;
      }
    }
  };

  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    () => worker(),
  );
  await Promise.all(workers);
  if (failed) throw failure;
  return results;
}
