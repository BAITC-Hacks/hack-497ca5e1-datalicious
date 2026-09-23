export function ProjectShell() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-widest text-teal-700">AI-симулятор управления городом</p>
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Аким на 5 часов</h1>
      <p className="text-lg text-slate-600">100 единиц бюджета. 5 решений. Будущее пяти районов Астаны.</p>
      <section aria-labelledby="status-title" className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 id="status-title" className="text-xl font-semibold">Симулятор готовится к запуску</h2>
        <p className="mt-3 text-slate-600">Вы сможете выбрать городские инициативы и увидеть их влияние на Astana Quality of Life Score.</p>
      </section>
    </main>
  );
}
