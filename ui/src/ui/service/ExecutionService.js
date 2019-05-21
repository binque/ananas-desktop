// @flow

import axios from 'axios'
import { Graph } from 'graphlib'

import type { 
  ID, 
  APIResponse, 
  PlainEngine,
  PlainProject, 
  PlainConnection, 
  PlainDataframe, 
  PlainStep 
} from '../../common/model/flowtypes.js'

import type VariableService from './VariableService'

export default class ExecutionService {
  store: any
  variableService: VariableService

  constructor(variableService: VariableService) {
    this.variableService = variableService
  }

  getServiceName() {
    return 'ExecutionService'
  }

  setStore(store:any) {
    this.store = store
  }

  getRunnerURL() {
    if (!this.store) {
      // TODO: use default
      return ''
    }
    let state = this.store.getState()
    if (state.settings) {
      return state.settings.runnerEndpoint
    }
    return ''
  }

  getUpstreamSteps(project: PlainProject, steps: Array<ID>) :Array<PlainStep> {
    let upstreams: {[string]: PlainStep} = {}
    let nodes = project.dag.nodes
    let edges = project.dag.connections

    let g = new Graph()

    nodes.forEach(node=>{
      g.setNode(node.id)
    })

    edges.forEach(edge=>{
      g.setEdge(edge.source, edge.target)
    })

    steps.forEach(stepId=>{
      g.predecessors(stepId).forEach(id=>{
        if (project.steps.hasOwnProperty(id)) {
          upstreams[id] = project.steps[id]
        }
      })
      if (project.steps.hasOwnProperty(stepId)) {
        upstreams[stepId] = project.steps[stepId]
      }
    })

    let ret = []
    for (let k in upstreams) {
      ret.push(upstreams[k])
    }
    return ret
  }

  getStepConfig(step: PlainStep) :any {
    let config = step.config || {}
    config = { ... config }
    for (let configKey in config) {
      if (configKey.startsWith('__') && configKey.endsWith('__')) {
        delete config[configKey]
      }
    }
    return config
  }

  /**
   * Explorer the data source or loader
   * @projectId ID the project id
   * @step PlainStep the step of the data source
   * @dict {[string]: any} the dictionary of the variables used in the config
   * @return Promise<APIResponse<PlainDataframe>>
   */
  exploreDataSource(projectId: ID, step: PlainStep, dict: {[string]:any}, page: number, pageSize: number) :Promise<APIResponse<PlainDataframe>> {
    let config = this.getStepConfig(step)
    // get expressions from the step, and inject the value from the dictionary
    let variables = {}
    let expressions = this.variableService.parseStepConfig(config)
    for (let key in expressions) {
      let expression = expressions[key]
      // TODO: keep {} for client side injection, remove it when pass to server side injection
      variables[key] = expression.eval(dict[expression.variable])
    }

    if (!step.id) {
      return new Promise((resolve, reject) => {reject(new Error('Invalid step id'))})
    }

    if (step.type === 'viewer') {
      // use viewer api
      return axios({
        method: 'GET',
        url: `${this.getRunnerURL()}/data/${step.id}?sql=${encodeURIComponent(config.sql)}`
      })
      .then(res=>{
        return res.data
      })
    }

    return axios({
      method: 'POST',
      // TODO: add project id in the url
      url: `${this.getRunnerURL()}/${step.id}/paginate?page=${page}&pagesize=${pageSize}`,
      data: {
        type: step.type,
        config, //this.variableService.injectExpressions(config, variables),
        params: dict,
      }
    })
    .then(res=>{
      return res.data
    })
  }

  /**
   * Test the current step
   * @return Promise<APIResponse<PlainDataframe>>
   */
  testStep(projectId: ID, connections: Array<PlainConnection>, steps: {[string]:PlainStep}, dict:{[string]:any}, runnableId: ID) :Promise<APIResponse<PlainDataframe>> {
    let newSteps = []
    for (let id in steps) {
      // inject variables for each step
      let step = steps[id]
      let config = this.getStepConfig(step)
      newSteps.push({
        id,
        type: step.type,
        config,
      })
    }
    return axios({
      method: 'POST',
      url: `${this.getRunnerURL()}/${projectId}/dag/test`,
      headers: {
        'content-type': 'application/json'
      },
      data: {
        dag: {
          connections,
          steps: newSteps,
        },
        goals: [
          runnableId
        ],
        params: dict,
      }
    })
    .then(res=>{
      return res.data
    })
  }

  /**
   * Run the multiple steps
   */
  run(user: any, projectId: ID, connections: Array<PlainConnection>, steps: {[string]:PlainStep},
    dict: {[string]:any}, runnables: Array<ID>, engine: PlainEngine) :Promise<APIResponse<ID>> {
    let newSteps = []
    for (let id in steps) {
      // inject variables for each step
      let step = steps[id]
      let config = this.getStepConfig(step)
      newSteps.push({
        id,
        type: step.type,
        config: config,
      })
    }

    // call runner API to get the jobId
    return axios({
      method: 'POST',
      url: `${this.getRunnerURL()}/${projectId}/dag/run`,
      headers: {
        'content-type': 'application/json',
        'authorization': user.token,
      },
      data: {
        dag: {
          connections,
          steps: newSteps,
        },
        goals: runnables,
        engine,
        params: dict,
      }
    })
    .then(res=>{
      return res.data
    })
  }

  /**
   * Run the current step
   * @return Promise<APIResponse<PlainDataframe>>
   */
  runStep(user: any, projectId: ID, connections: Array<PlainConnection>, steps: {[string]:PlainStep}, 
          dict:{[string]:any}, runnableId: ID, engine: PlainEngine) :Promise<APIResponse<ID>> {
    return this.run(user, projectId, connections, steps, dict, [ runnableId ], engine) 
  }
}