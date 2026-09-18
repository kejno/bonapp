import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  PaymentGatewayCredentials,
  PaymentOnboardingStatusResponse,
} from "@bonapp/shared-types";

const queryClient = new QueryClient();
const endpoint = "/api/v1/admin/tenant/onboarding/step3/payments";

type Gateway = "OPLATI" | "ERIP_EPOS" | "BEPAY_WEBPAY" | "SKNO_TITAN_PLUS";

const gatewayDetails: Record<Gateway, { title: string; description: string }> =
  {
    OPLATI: { title: "Оплати™ QR", description: "Комиссия 0,8%" },
    ERIP_EPOS: {
      title: "ЕРИП E-POS",
      description: "Приём платежей через ЕРИП",
    },
    BEPAY_WEBPAY: {
      title: "bePaid / Webpay",
      description: "Выберите используемого провайдера",
    },
    SKNO_TITAN_PLUS: {
      title: "СКНО «Титан-Плюс»",
      description: "Реквизиты программной кассы",
    },
  };

function Fields({ gateway }: { gateway: Gateway }) {
  if (gateway === "OPLATI")
    return (
      <label>
        Merchant ID
        <Input name="merchantId" />
      </label>
    );
  if (gateway === "ERIP_EPOS")
    return (
      <>
        <label>
          Service ID
          <Input name="serviceId" />
        </label>
        <label>
          Секрет
          <Input name="secret" type="password" />
        </label>
      </>
    );
  if (gateway === "BEPAY_WEBPAY")
    return (
      <>
        <label>
          Провайдер
          <select name="provider">
            <option value="bepaid">bePaid</option>
            <option value="webpay">Webpay</option>
          </select>
        </label>
        <label>
          Shop ID
          <Input name="shopId" />
        </label>
        <label>
          Секрет
          <Input name="secret" type="password" />
        </label>
        <label>
          Тип
          <select name="environment">
            <option value="TEST">TEST</option>
            <option value="PROD">PROD</option>
          </select>
        </label>
      </>
    );
  return (
    <>
      <label>
        Серийный номер кассы
        <Input name="cashRegisterSerialNumber" />
      </label>
      <label>
        УНП
        <Input name="unp" />
      </label>
    </>
  );
}

function Input({ name, type = "text" }: { name: string; type?: string }) {
  return (
    <input
      required
      name={name}
      type={type}
      className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
    />
  );
}

function PaymentOnboarding() {
  const [connected, setConnected] = useState<Partial<Record<Gateway, boolean>>>(
    {},
  );
  const [saving, setSaving] = useState<Gateway | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadStatuses() {
      try {
        const response = await fetch(endpoint);
        if (!response.ok) return;
        const data = (await response.json()) as PaymentOnboardingStatusResponse;
        setConnected(
          Object.fromEntries(
            data.gateways.map(({ gateway, connected }) => [gateway, connected]),
          ),
        );
      } catch {
        // The user can still configure a gateway when statuses are temporarily unavailable.
      }
    }
    void loadStatuses();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>, gateway: Gateway) {
    event.preventDefault();
    const values = Object.fromEntries(
      new FormData(event.currentTarget),
    ) as Record<string, string>;
    setSaving(gateway);
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gateways: [{ gateway, ...values } as PaymentGatewayCredentials],
        }),
      });
      if (!response.ok) throw new Error("save failed");
      setConnected((current) => ({ ...current, [gateway]: true }));
    } catch {
      setMessage(
        "Не удалось сохранить реквизиты. Проверьте заполнение полей и повторите попытку.",
      );
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className="min-h-svh bg-bonapp-bg px-4 py-10 text-stone-900 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <p className="text-sm font-medium text-bonapp-accent">
          Онбординг · Шаг 3
        </p>
        <h1 className="mt-2 text-3xl font-semibold">
          Подключение платёжных шлюзов
        </h1>
        <p className="mt-3 text-stone-600">
          Добавьте реквизиты сервисов сейчас или продолжите с режимом «Оплата
          официанту».
        </p>
        {message && (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700"
          >
            {message}
          </p>
        )}
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {(Object.keys(gatewayDetails) as Gateway[]).map((gateway) => (
            <section
              key={gateway}
              className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm"
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">
                    {gatewayDetails[gateway].title}
                  </h2>
                  <p className="mt-1 text-sm text-stone-500">
                    {gatewayDetails[gateway].description}
                  </p>
                </div>
                <span
                  className={
                    connected[gateway]
                      ? "rounded-full bg-emerald-100 px-3 py-1 text-sm text-emerald-700"
                      : "rounded-full bg-stone-100 px-3 py-1 text-sm text-stone-600"
                  }
                >
                  {connected[gateway] ? "Подключено" : "Не подключено"}
                </span>
              </div>
              <form
                onSubmit={(event) => save(event, gateway)}
                className="grid gap-3 text-sm font-medium"
              >
                {" "}
                <Fields gateway={gateway} />
                <button
                  className="rounded-lg bg-bonapp-accent px-4 py-2 text-white disabled:opacity-60"
                  disabled={saving === gateway}
                >
                  {saving === gateway ? "Сохранение…" : "Сохранить"}
                </button>
              </form>
            </section>
          ))}
        </div>
        <button
          className="mt-8 text-sm font-medium text-stone-600 underline"
          onClick={() =>
            setMessage("Шаг пропущен. Доступен режим «Оплата официанту».")
          }
        >
          Пропустить шаг
        </button>
      </div>
    </main>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PaymentOnboarding />
    </QueryClientProvider>
  );
}

export default App;
