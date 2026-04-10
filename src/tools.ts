export const tools = [
  {
    name: "get_job_details",
    description: "Returns job details for a given job ID.",
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
    name: "get_temp_details",
    description: "Returns temp details for a given temp ID, including assigned jobs.",
    inputSchema: {
      type: "object",
      properties: {
        tempId: {
          type: "number",
          description: "The ID of the temp.",
        },
      },
      required: ["tempId"],
    },
  },
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
    name: "suggest_best_temp_for_job",
    description:
      "Returns the best available temp suggestion for a given job ID, preferring the lowest current workload.",
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
    name: "explain_temp_availability_for_job",
    description:
      "Explains whether a specific temp can take a specific job, and if not, why not.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: {
          type: "number",
          description: "The ID of the job.",
        },
        tempId: {
          type: "number",
          description: "The ID of the temp.",
        },
      },
      required: ["jobId", "tempId"],
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