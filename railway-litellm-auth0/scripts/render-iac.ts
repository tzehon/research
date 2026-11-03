import program from '../.railway/railway.ts';
import { createRailwayContext, project } from 'railway/iac';
// Validation helper: do not print the graph, which includes secrets.
await program(createRailwayContext(), project);
console.log('Railway IaC evaluated successfully. Secret values were not printed.');
