import Image from 'next/image'
import logo from '@/assets/logo.svg'

export function Logo() {
  return (
    <span className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
      <Image src={logo} alt="" width={24} height={24} priority />
      Daybook
    </span>
  )
}
