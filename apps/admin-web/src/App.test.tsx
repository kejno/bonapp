import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the onboarding heading", () => {
    render(<App />);
    expect(
      screen.getByText("Подключение платёжных шлюзов"),
    ).toBeInTheDocument();
  });

  it("renders payment gateway cards for onboarding step 3", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Подключение платёжных шлюзов" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Merchant ID")).toBeInTheDocument();
    expect(screen.getByLabelText("Service ID")).toBeInTheDocument();
    expect(screen.getByLabelText("Провайдер")).toBeInTheDocument();
    expect(screen.getByLabelText("Серийный номер кассы")).toBeInTheDocument();
    expect(screen.getAllByText("Не подключено")).toHaveLength(4);
  });
});
