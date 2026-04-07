<?php

namespace App\Http\Middleware;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        return [
            ...parent::share($request),
            'name' => config('app.name'),
            'auth' => [
                'user' => $request->user(),
            ],
            'sidebarOpen' => ! $request->hasCookie('sidebar_state') || $request->cookie('sidebar_state') === 'true',
            'apiMeta' => fn () => $this->resolveApiMeta(),
        ];
    }

    /**
     * Resolve engine metadata for first paint and cache it briefly to avoid
     * adding a blocking upstream call to every Inertia response.
     *
     * @return array{version: string|null, isUp: bool}
     */
    protected function resolveApiMeta(): array
    {
        return Cache::remember('engine_api_meta', now()->addSeconds(15), function (): array {
            $apiUrl = rtrim((string) env('API_URL', 'http://localhost:3001/v1'), '/');
            $healthUrl = preg_replace('#/v1$#', '', $apiUrl) . '/v1/health';

            try {
                $response = Http::timeout(2)->acceptJson()->get($healthUrl);

                if (! $response->successful()) {
                    return [
                        'version' => null,
                        'isUp' => false,
                    ];
                }

                return [
                    'version' => $response->json('version'),
                    'isUp' => true,
                ];
            } catch (\Throwable) {
                return [
                    'version' => null,
                    'isUp' => false,
                ];
            }
        });
    }
}
