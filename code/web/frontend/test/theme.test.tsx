import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, it, expect } from "vitest";
import { ThemeProvider } from "../src/theme/ThemeProvider";
import { ThemeToggle } from "../src/theme/ThemeToggle";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

describe("theme 3-mode", () => {
  it("기본 = system, data-theme 반영(light, matchMedia stub)", () => {
    renderToggle();
    expect(screen.getByText("시스템")).toBeInTheDocument();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("클릭 시 system → dark → light 순환 + localStorage 지속", () => {
    renderToggle();
    const btn = screen.getByRole("button");

    fireEvent.click(btn); // → dark
    expect(screen.getByText("다크")).toBeInTheDocument();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("gootte-theme")).toBe("dark");

    fireEvent.click(btn); // → light
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem("gootte-theme")).toBe("light");

    fireEvent.click(btn); // → system
    expect(screen.getByText("시스템")).toBeInTheDocument();
    expect(localStorage.getItem("gootte-theme")).toBe("system");
  });
});
