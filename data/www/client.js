import { showError } from './alerts.js';

export async function leftRetractDown() {
    await postCommand("l-ret");
}

export async function leftExtendDown() {
    await postCommand("l-ext");
}

export async function rightRetractDown() {
    await postCommand("r-ret");
}

export async function rightExtendDown() {
    await postCommand("r-ext");
}

export async function leftRetractUp() {
    await postCommand("l-0");
}

export async function leftExtendUp() {
    await postCommand("l-0");
}

export async function rightRetractUp() {
    await postCommand("r-0");
}

export async function rightExtendUp() {
    await postCommand("r-0");
}

async function postCommand(command) {
    $.post("/command", {command}).fail(function() {
        showError(`Command "${command}" failed`, () => postCommand(command));
    });
}