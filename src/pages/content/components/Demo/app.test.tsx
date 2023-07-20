import { render } from "@testing-library/react";
import App from "@pages/content/components/Demo/app";

describe("contentAppTest", () => {
  test("should return null", () => {
    const { container } = render(<App />);
    expect(container.firstChild).toBeNull();
  });
});
