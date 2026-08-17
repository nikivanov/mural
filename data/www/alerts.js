// Shared inline error-alert helper. Replaces alert()+location.reload() failure
// handling across the app so wizard state (including long-running renders) is
// never destroyed by a transient request failure.

let alertCounter = 0;

// Shows a dismissible alert with an optional Retry button.
// message: string to display.
// retryFn: optional function to call (with no args) if the user clicks Retry.
export function showError(message, retryFn) {
    const container = $("#errorAlertContainer");
    if (!container.length) {
        // Fall back to a plain alert if the host page has no container (shouldn't happen).
        window.alert(message);
        return;
    }

    alertCounter++;
    const retryId = `errAlertRetry${alertCounter}`;

    const $alert = $(`
        <div class="alert alert-danger alert-dismissible" role="alert">
            <span class="err-message"></span>
            ${retryFn ? `<button type="button" class="btn btn-sm btn-outline-danger ms-2" id="${retryId}">Retry</button>` : ''}
            <button type="button" class="btn-close" aria-label="Close"></button>
        </div>
    `);
    $alert.find(".err-message").text(message);
    $alert.find(".btn-close").click(function () {
        $alert.remove();
    });

    if (retryFn) {
        $alert.find(`#${retryId}`).click(function () {
            $alert.remove();
            retryFn();
        });
    }

    container.append($alert);
}
