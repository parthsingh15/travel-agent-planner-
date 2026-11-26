import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import SearchPage from "@/app/search/page";

vi.mock("@/components/dashboard-layout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("clears visible flight results and ignores an in-flight response when switching to Hotels", async () => {
  let finishFlight!: (response: Response) => void;
  const delayedFlight = new Promise<Response>((resolve) => { finishFlight = resolve; });
  const flight = {
    id: "fixture-flight", type: "FLIGHT", title: "Fixture Airline", subtitle: "DEL to BOM",
    price: 6000, currency: "INR", source: "Google Flights via SerpApi", checkedAt: "2026-11-26T10:00:00Z",
  };
  const responses = [Promise.resolve(Response.json({ offers: [flight] })), delayedFlight];
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    if (url === "/api/bookmarks") return Promise.resolve(Response.json({ bookmarks: [] }));
    return responses.shift();
  }));
  render(<SearchPage />);
  const searchFlight = () => fireEvent.click(within(screen.getByRole("main")).getByRole("button", { name: "Search flights" }));
  const hotels = () => fireEvent.click(screen.getByRole("button", { name: "Hotels" }));
  searchFlight();
  expect(await screen.findByText("Fixture Airline")).toBeTruthy();
  hotels();
  expect(screen.queryByText("Fixture Airline")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Flights" }));
  searchFlight();
  hotels();
  await act(async () => { finishFlight(Response.json({ offers: [flight] })); });
  expect(screen.queryByText("Fixture Airline")).toBeNull();
  expect(screen.getByRole("button", { name: "Search hotels" })).toBeTruthy();
});
