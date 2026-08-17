// Zero-dependency replacement for Bootstrap's Modal component, built on the
// native <dialog> element. Bootstrap CSS/JS was dropped (see main.css) so
// this wires up the same triggers/dismiss buttons the markup used to
// declare via data-bs-toggle/data-bs-target/data-bs-dismiss, and re-emits
// the same 'show.bs.modal' / 'hidden.bs.modal' custom events main.js
// already listens for, so main.js needed no changes for that part.
//
// Markup contract:
//   <button data-modal-target="someId">open</button>
//   <dialog class="mural-modal" id="someId">...
//     <button data-modal-dismiss>close</button>
//   </dialog>

function openModal(dialog) {
    if (dialog.open) {
        return;
    }
    dialog.dispatchEvent(new CustomEvent('show.bs.modal'));
    dialog.showModal();
}

function closeModal(dialog) {
    if (!dialog.open) {
        return;
    }
    dialog.close();
}

document.addEventListener('click', function (e) {
    const opener = e.target.closest('[data-modal-target]');
    if (opener) {
        const dialog = document.getElementById(opener.getAttribute('data-modal-target'));
        if (dialog) {
            openModal(dialog);
        }
        return;
    }

    const dismisser = e.target.closest('[data-modal-dismiss]');
    if (dismisser) {
        const dialog = dismisser.closest('dialog');
        if (dialog) {
            closeModal(dialog);
        }
    }
});

// Clicking the backdrop (native <dialog> reports this as a click on the
// dialog element itself, outside its content box) also dismisses.
document.querySelectorAll('dialog.mural-modal').forEach(function (dialog) {
    dialog.addEventListener('click', function (e) {
        if (e.target === dialog) {
            closeModal(dialog);
        }
    });

    // Fires on close() and on ESC-key dismissal alike - matches Bootstrap's
    // 'hidden.bs.modal' timing closely enough for the cleanup main.js does.
    dialog.addEventListener('close', function () {
        dialog.dispatchEvent(new CustomEvent('hidden.bs.modal'));
    });
});

// ---------------------------------------------------------------------------
// Info (i) disclosures
//
// The badges are native <details> elements sharing a `name`, so opening one
// natively closes the others with no JS at all. Two behaviours the native
// element does NOT give us, both of which users expect from a tooltip-like
// affordance, are added here:
//   1. clicking anywhere else on the page dismisses the open panel
//   2. Escape dismisses it
// Kept here rather than in main.js because it is presentation behaviour that
// belongs with the other UI-chrome shims, and because main.js should not need
// to know these exist.
// ---------------------------------------------------------------------------
function closeAllInfoPanels(except) {
    document.querySelectorAll('details.info[open]').forEach(function (d) {
        if (d !== except) {
            d.open = false;
        }
    });
}

document.addEventListener('click', function (e) {
    // A click inside an open disclosure (its badge or its panel) is not an
    // "outside" click and must not dismiss it.
    const insideInfo = e.target.closest && e.target.closest('details.info');
    closeAllInfoPanels(insideInfo);
});

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        closeAllInfoPanels(null);
    }
});
