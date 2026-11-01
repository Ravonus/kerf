import { Select } from '../../src/Select'

const options = [{ value: 'a', label: 'A' }, { group: 'More', options: [{ value: 'b', label: 'B' }] }, { value: 'c', label: 'C' }]

export const Picked = ({ value }: { value: string }) => <Select label="Pick" options={options} value={value} />
