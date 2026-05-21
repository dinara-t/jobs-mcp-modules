import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleChatMessage } from "./chat.js";
import * as toolHandlers from "./toolHandlers.js";
vi.mock("./toolHandlers.js", async () => {
    const actual = await vi.importActual("./toolHandlers.js");
    return {
        ...actual,
        handleToolCall: vi.fn(),
        resolveVisibleJobByName: vi.fn(),
        resolveVisibleTempByName: vi.fn(),
    };
});
const mockedHandleToolCall = vi.mocked(toolHandlers.handleToolCall);
const mockedResolveVisibleJobByName = vi.mocked(toolHandlers.resolveVisibleJobByName);
const mockedResolveVisibleTempByName = vi.mocked(toolHandlers.resolveVisibleTempByName);
const makeJobMatch = (id, name) => ({
    id,
    name,
    startDate: "2026-04-20",
    endDate: "2026-04-22",
});
describe("handleChatMessage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedResolveVisibleJobByName.mockResolvedValue({ status: "none" });
        mockedResolveVisibleTempByName.mockResolvedValue({ status: "none" });
    });
    it("uses current job context for best temp suggestions", async () => {
        mockedHandleToolCall.mockResolvedValue({
            status: 200,
            body: {
                content: [
                    {
                        type: "text",
                        text: "Best temp suggestion for job 12 (Solar Installer):\nSarah Lee (Temp 5)",
                    },
                ],
            },
        });
        const result = await handleChatMessage("Suggest the best temp for this job", {
            chatContext: {
                currentJobId: 12,
            },
        });
        expect(result.status).toBe(200);
        expect(mockedHandleToolCall).toHaveBeenCalledWith("suggest_best_temp_for_job", { jobId: 12 }, {
            chatContext: {
                currentJobId: 12,
            },
        });
        expect(result.body.reply).toContain("Best temp suggestion for job 12");
        expect(result.body.suggestedActions).toEqual([
            {
                type: "send_message",
                label: "Assign them",
                message: "Assign them",
            },
            {
                type: "send_message",
                label: "Why are they available?",
                message: "Can they take this job?",
            },
            {
                type: "send_message",
                label: "Show all available temps",
                message: "Show available temps for this job",
            },
        ]);
        expect(result.body.resolvedEntities).toEqual({
            jobId: 12,
            tempId: null,
            usedCurrentJobContext: true,
            usedLastSuggestedTempContext: false,
        });
    });
    it("uses last suggested temp context when assigning them", async () => {
        const result = await handleChatMessage("Assign them", {
            chatContext: {
                currentJobId: 12,
                lastSuggestedTempId: 5,
            },
        });
        expect(result.status).toBe(200);
        expect(mockedHandleToolCall).not.toHaveBeenCalled();
        expect(result.body.reply).toBe("I can assign temp 5 to job 12. Please confirm to continue.");
        expect(result.body.pendingAction).toEqual({
            type: "assign_temp_to_job",
            jobId: 12,
            tempId: 5,
            title: "Assign temp",
            message: "Assign temp 5 to job 12?",
            confirmLabel: "Confirm assign",
        });
        expect(result.body.suggestedActions).toEqual([
            {
                type: "confirm_pending_action",
                label: "Confirm assign",
            },
            {
                type: "send_message",
                label: "Show temp details",
                message: "Show temp 5 details",
            },
        ]);
        expect(result.body.resolvedEntities).toEqual({
            jobId: 12,
            tempId: 5,
            usedCurrentJobContext: true,
            usedLastSuggestedTempContext: true,
        });
    });
    it("confirms assign actions through the tool layer", async () => {
        mockedHandleToolCall.mockResolvedValue({
            status: 200,
            body: {
                content: [
                    {
                        type: "text",
                        text: "Assigned Sarah Lee (Temp 5) to job 12 (Solar Installer).",
                    },
                ],
            },
        });
        const result = await handleChatMessage("__confirm_assign__ temp 5 to job 12", {
            chatContext: {
                currentJobId: 12,
                lastSuggestedTempId: 5,
            },
        });
        expect(result.status).toBe(200);
        expect(mockedHandleToolCall).toHaveBeenCalledWith("assign_temp_to_job", { jobId: 12, tempId: 5 }, {
            chatContext: {
                currentJobId: 12,
                lastSuggestedTempId: 5,
            },
        });
        expect(result.body.reply).toBe("Assigned Sarah Lee (Temp 5) to job 12 (Solar Installer).");
        expect(result.body.pendingAction).toBeUndefined();
        expect(result.body.suggestedActions).toEqual([
            {
                type: "send_message",
                label: "Show job details",
                message: "Show details for this job",
            },
            {
                type: "send_message",
                label: "Show temp details",
                message: "Show temp 5 details",
            },
        ]);
    });
    it("returns clarification prompts when a temp name is ambiguous", async () => {
        mockedResolveVisibleTempByName.mockResolvedValue({
            status: "ambiguous",
            matches: [
                { id: 5, firstName: "Sarah", lastName: "Lee" },
                { id: 8, firstName: "Sarah", lastName: "Lim" },
            ],
        });
        const result = await handleChatMessage("Show Sarah details", {
            chatContext: {
                currentJobId: 12,
            },
        });
        expect(result.status).toBe(200);
        expect(mockedHandleToolCall).not.toHaveBeenCalled();
        expect(result.body.reply).toBe("I found more than one matching temp name. Choose the person you meant.");
        expect(result.body.clarificationPrompts).toEqual([
            {
                id: "details-temp-5",
                label: "Sarah Lee (Temp 5)",
                message: "Show temp 5 details",
            },
            {
                id: "details-temp-8",
                label: "Sarah Lim (Temp 8)",
                message: "Show temp 8 details",
            },
        ]);
        expect(result.body.resolvedEntities).toEqual({
            jobId: null,
            tempId: null,
            usedCurrentJobContext: false,
            usedLastSuggestedTempContext: false,
        });
    });
    it("returns clarification prompts when a job name is ambiguous", async () => {
        mockedResolveVisibleJobByName.mockResolvedValue({
            status: "ambiguous",
            matches: [makeJobMatch(12, "Solar Installer"), makeJobMatch(18, "Solar Installer")],
        });
        const result = await handleChatMessage("Show available temps for Solar Installer");
        expect(result.status).toBe(200);
        expect(mockedHandleToolCall).not.toHaveBeenCalled();
        expect(result.body.reply).toBe("I found more than one matching job name. Choose the one you meant.");
        expect(result.body.clarificationPrompts).toEqual([
            {
                id: "available-job-12",
                label: "Solar Installer (Job 12)",
                message: "Show available temps for job 12",
            },
            {
                id: "available-job-18",
                label: "Solar Installer (Job 18)",
                message: "Show available temps for job 18",
            },
        ]);
    });
    it("explains that both entities are needed for availability questions", async () => {
        const result = await handleChatMessage("Can they take this job?");
        expect(result.status).toBe(200);
        expect(mockedHandleToolCall).not.toHaveBeenCalled();
        expect(result.body.reply).toContain("I need both a temp and a job to explain availability.");
        expect(result.body.clarificationPrompts).toEqual([
            {
                id: "why-temp-5",
                label: "Why is temp 5 unavailable for this job?",
                message: "Why is temp 5 unavailable for this job?",
            },
            {
                id: "can-they-take",
                label: "Can they take this job?",
                message: "Can they take this job?",
            },
        ]);
    });
});
