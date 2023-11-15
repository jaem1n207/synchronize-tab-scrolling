import { debounce } from "../utils/utils";

jest.useFakeTimers();
describe("debounce util", () => {
  it("debounce 함수는 반환된 함수의 마지막 값을 반환합니다", () => {
    const fn = jest.fn();
    const debouncedCallback = debounce(fn, 100);

    debouncedCallback(1);
    debouncedCallback(2);
    debouncedCallback(3);

    expect(fn).not.toHaveBeenCalled();

    jest.runAllTimers();

    expect(fn).toHaveBeenCalledWith(3);
  });
});
