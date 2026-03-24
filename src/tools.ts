export const tools = [
  {
    name: "get_available_temps_for_job",
    description: "Returns available temps for a given job ID.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: {
          type: "number",
          description: "The ID of the job.",
        },
      },
      required: ["jobId"],
    },
  },
  {
    name: "assign_temp_to_job",
    description: "Assigns a temp to a given job ID.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: {
          type: "number",
          description: "The ID of the job.",
        },
        tempId: {
          type: "number",
          description: "The ID of the temp to assign.",
        },
      },
      required: ["jobId", "tempId"],
    },
  },
  {
    name: "unassign_temp_from_job",
    description: "Unassigns the current temp from a given job ID.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: {
          type: "number",
          description: "The ID of the job.",
        },
      },
      required: ["jobId"],
    },
  },
];